import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';

type MealType = 'sat_breakfast' | 'sat_lunch' | 'sat_dinner' | 'sun_breakfast' | 'sun_lunch';

// Helper function to extract t-shirt size from responses
function getTShirtSize(responses: Record<string, any> | null | undefined): string | null {
  if (!responses || typeof responses !== 'object') return null;
  
  // Try common field name variations
  const commonKeys = [
    'T-Shirt Size',
    'T-shirt Size',
    'T-Shirt size',
    't_shirt_size',
    'tshirt_size',
    'TShirt Size',
    'Tshirt Size',
    'T SHIRT SIZE',
    'T-SHIRT SIZE',
    'T-shirt size',
    'T-shirt',
    'Shirt Size',
    'shirt_size'
  ];
  
  for (const key of commonKeys) {
    if (responses[key]) {
      return String(responses[key]).trim() || null;
    }
  }
  
  // Try to find any key that contains "shirt" (case-insensitive)
  const key = Object.keys(responses).find(k => {
    const lower = k.toLowerCase();
    return lower.includes('shirt') || lower.includes('tshirt');
  });
  
  if (key && responses[key]) {
    return String(responses[key]).trim() || null;
  }
  
  return null;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const body = JSON.parse(event.body || '{}');
    const { token, mealType } = body as { token: string; mealType?: MealType };
    if (!token) return { statusCode: 400, body: 'Missing token' };

    // Get the applicant first to check existence
    const { data: applicant, error: fetchError } = await supabaseAdmin
      .from('applicants')
      .select('id, checked_in_at, meal_checkins, responses, full_name')
      .eq('qr_token', token)
      .single();

    if (fetchError || !applicant) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, reason: 'NOT_FOUND' }) };
    }

    if (mealType) {
      // Meal check-in - use atomic update with WHERE clause to prevent race conditions
      // Only update if the mealType key doesn't exist in the JSONB
      const timestamp = new Date().toISOString();
      
      // Use PostgreSQL's jsonb_set with a WHERE clause that checks the key doesn't exist
      // This ensures atomicity: if 7 organizers scan at once, only the first update succeeds
      const { data: updated, error: updateError } = await supabaseAdmin.rpc('atomic_meal_checkin', {
        applicant_id: applicant.id,
        meal_type: mealType,
        checkin_time: timestamp,
      });

      // If RPC function doesn't exist, fall back to check-then-update (with race condition risk)
      // This happens if the database function hasn't been created yet
      if (updateError && updateError.message.includes('function') && updateError.message.includes('does not exist')) {
        // Fallback: Check and update manually (race condition possible but unlikely)
        const mealCheckins = (applicant.meal_checkins as Record<string, string>) || {};
        
        if (mealCheckins[mealType]) {
          const tShirtSize = getTShirtSize(applicant.responses);
          return { 
            statusCode: 409, 
            body: JSON.stringify({ 
              ok: false, 
              reason: 'ALREADY_CHECKED_IN',
              tShirtSize: tShirtSize || null,
              name: applicant.full_name || null
            }) 
          };
        }

        const updatedMealCheckins = {
          ...mealCheckins,
          [mealType]: timestamp,
        };

        const { error: fallbackError } = await supabaseAdmin
          .from('applicants')
          .update({ meal_checkins: updatedMealCheckins })
          .eq('id', applicant.id);

        if (fallbackError) throw fallbackError;

        // Re-check to see if we actually succeeded (detect race condition)
        const { data: verify } = await supabaseAdmin
          .from('applicants')
          .select('meal_checkins')
          .eq('id', applicant.id)
          .single();

        const verifyCheckins = (verify?.meal_checkins as Record<string, string>) || {};
        if (verifyCheckins[mealType] !== timestamp) {
          // Someone else updated first
          const tShirtSize = getTShirtSize(applicant.responses);
          return { 
            statusCode: 409, 
            body: JSON.stringify({ 
              ok: false, 
              reason: 'ALREADY_CHECKED_IN',
              tShirtSize: tShirtSize || null,
              name: applicant.full_name || null
            }) 
          };
        }
      } else if (updateError) {
        // If update failed because key already exists (our function returns null)
        if (updateError.message.includes('already exists') || updateError.message.includes('duplicate')) {
          const tShirtSize = getTShirtSize(applicant.responses);
          return { 
            statusCode: 409, 
            body: JSON.stringify({ 
              ok: false, 
              reason: 'ALREADY_CHECKED_IN',
              tShirtSize: tShirtSize || null,
              name: applicant.full_name || null
            }) 
          };
        }
        throw updateError;
      } else if (!updated) {
        // RPC function returned null/false, meaning already checked in
        const tShirtSize = getTShirtSize(applicant.responses);
        return { 
          statusCode: 409, 
          body: JSON.stringify({ 
            ok: false, 
            reason: 'ALREADY_CHECKED_IN',
            tShirtSize: tShirtSize || null,
            name: applicant.full_name || null
          }) 
        };
      }

      // Get t-shirt size from responses
      const tShirtSize = getTShirtSize(applicant.responses);
      
      // Debug logging
      console.log('Meal check-in - Applicant:', applicant.full_name, 'Responses keys:', Object.keys(applicant.responses || {}), 'T-shirt size:', tShirtSize);
      
      return { 
        statusCode: 200, 
        body: JSON.stringify({ 
          ok: true, 
          applicantId: applicant.id, 
          mealType,
          tShirtSize: tShirtSize || null,
          name: applicant.full_name || null
        }) 
      };
    } else {
      // Regular check-in - use conditional update (atomic)
      if (applicant.checked_in_at) {
        // Get t-shirt size from responses even for already checked in
        const tShirtSize = getTShirtSize(applicant.responses);
        return { 
          statusCode: 409, 
          body: JSON.stringify({ 
            ok: false, 
            reason: 'ALREADY_CHECKED_IN',
            tShirtSize: tShirtSize || null,
            name: applicant.full_name || null
          }) 
        };
      }

      // This update is atomic because it only succeeds if checked_in_at is still null
      const { error: updateError, data: updated } = await supabaseAdmin
        .from('applicants')
        .update({ checked_in_at: new Date().toISOString() })
        .eq('id', applicant.id)
        .is('checked_in_at', null)
        .select('id')
        .single();

      // If no rows were updated, it means another request already set checked_in_at
      if (updateError || !updated) {
        const tShirtSize = getTShirtSize(applicant.responses);
        return { 
          statusCode: 409, 
          body: JSON.stringify({ 
            ok: false, 
            reason: 'ALREADY_CHECKED_IN',
            tShirtSize: tShirtSize || null,
            name: applicant.full_name || null
          }) 
        };
      }

      // Get t-shirt size from responses
      const tShirtSize = getTShirtSize(applicant.responses);
      
      // Debug logging
      console.log('Regular check-in - Applicant:', applicant.full_name, 'Responses keys:', Object.keys(applicant.responses || {}), 'T-shirt size:', tShirtSize);
      
      return { 
        statusCode: 200, 
        body: JSON.stringify({ 
          ok: true, 
          applicantId: applicant.id,
          tShirtSize: tShirtSize || null,
          name: applicant.full_name || null
        }) 
      };
    }
  } catch (err: any) {
    console.error('Check-in error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};


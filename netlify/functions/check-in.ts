import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';

type MealType = 'sat_breakfast' | 'sat_lunch' | 'sat_dinner' | 'sun_breakfast' | 'sun_lunch';

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const body = JSON.parse(event.body || '{}');
    const { token, mealType } = body as { token: string; mealType?: MealType };
    if (!token) return { statusCode: 400, body: 'Missing token' };

    // Get the applicant first to check existence and current state
    const { data: applicant, error: fetchError } = await supabaseAdmin
      .from('applicants')
      .select('id, checked_in_at, meal_checkins')
      .eq('qr_token', token)
      .single();

    if (fetchError || !applicant) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, reason: 'NOT_FOUND' }) };
    }

    if (mealType) {
      // Meal check-in
      const mealCheckins = (applicant.meal_checkins as Record<string, string>) || {};
      
      // Check if already checked in for this meal
      if (mealCheckins[mealType]) {
        return { statusCode: 409, body: JSON.stringify({ ok: false, reason: 'ALREADY_CHECKED_IN' }) };
      }

      // Update meal check-ins
      const updatedMealCheckins = {
        ...mealCheckins,
        [mealType]: new Date().toISOString(),
      };

      const { error: updateError } = await supabaseAdmin
        .from('applicants')
        .update({ meal_checkins: updatedMealCheckins })
        .eq('id', applicant.id);

      if (updateError) throw updateError;

      return { statusCode: 200, body: JSON.stringify({ ok: true, applicantId: applicant.id, mealType }) };
    } else {
      // Regular check-in
      if (applicant.checked_in_at) {
        return { statusCode: 409, body: JSON.stringify({ ok: false, reason: 'ALREADY_CHECKED_IN' }) };
      }

      const { error: updateError } = await supabaseAdmin
        .from('applicants')
        .update({ checked_in_at: new Date().toISOString() })
        .eq('id', applicant.id)
        .is('checked_in_at', null);

      if (updateError) throw updateError;

      return { statusCode: 200, body: JSON.stringify({ ok: true, applicantId: applicant.id }) };
    }
  } catch (err: any) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};


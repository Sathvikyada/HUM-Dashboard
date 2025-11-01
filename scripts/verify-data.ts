import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Verification checks
async function verifyData() {
  console.log('🔍 Starting data verification...\n');
  
  try {
    // Get all applicants
    const { data: applicants, error, count } = await supabase
      .from('applicants')
      .select('*', { count: 'exact' });
    
    if (error) throw error;
    
    if (!applicants || applicants.length === 0) {
      console.log('⚠️  No applicants found in database');
      return;
    }
    
    console.log(`📊 Total applicants: ${count}\n`);
    
    // Statistics
    let missingEmail = 0;
    let missingFullName = 0;
    let missingUniversity = 0;
    let missingGraduationYear = 0;
    let emptyResponses = 0;
    let invalidStatus = 0;
    let invalidDecidedBy = 0;
    
    // Detailed issues
    const issues: string[] = [];
    
    for (const applicant of applicants) {
      // Check required fields
      if (!applicant.email || applicant.email.trim() === '') {
        missingEmail++;
        issues.push(`❌ ${applicant.id}: Missing email`);
      }
      
      if (!applicant.full_name || applicant.full_name.trim() === '') {
        missingFullName++;
        issues.push(`❌ ${applicant.id}: Missing full_name`);
      }
      
      // Check university field
      if (!applicant.university || applicant.university.trim() === '') {
        missingUniversity++;
        issues.push(`⚠️  ${applicant.email}: Missing university`);
      }
      
      // Check graduation year
      if (!applicant.graduation_year || applicant.graduation_year.trim() === '') {
        missingGraduationYear++;
      }
      
      // Check responses
      if (!applicant.responses || typeof applicant.responses !== 'object' || Object.keys(applicant.responses).length === 0) {
        emptyResponses++;
        issues.push(`❌ ${applicant.email}: Empty responses`);
      } else {
        // Verify email in responses matches
        const responses = applicant.responses as Record<string, any>;
        const emailInResponses = responses['Email'] || responses['email'];
        if (emailInResponses && emailInResponses.toLowerCase() !== applicant.email.toLowerCase()) {
          issues.push(`⚠️  ${applicant.email}: Email mismatch in responses (${emailInResponses})`);
        }
      }
      
      // Check status
      const validStatuses = ['pending', 'accepted', 'waitlisted', 'denied'];
      if (!validStatuses.includes(applicant.status)) {
        invalidStatus++;
        issues.push(`❌ ${applicant.email}: Invalid status: ${applicant.status}`);
      }
      
      // Check decided_by consistency
      if (applicant.status !== 'pending' && !applicant.decided_by) {
        invalidDecidedBy++;
      }
      if (applicant.status === 'pending' && applicant.decided_by) {
        invalidDecidedBy++;
        issues.push(`⚠️  ${applicant.email}: Pending but has decided_by: ${applicant.decided_by}`);
      }
    }
    
    // Summary statistics
    console.log('📈 Data Quality Summary:');
    console.log('=' .repeat(50));
    console.log(`✅ Total applicants: ${applicants.length}`);
    console.log(`✅ Valid emails: ${applicants.length - missingEmail}`);
    console.log(`✅ Valid full names: ${applicants.length - missingFullName}`);
    console.log(`✅ Has university: ${applicants.length - missingUniversity} (${(100 * (applicants.length - missingUniversity) / applicants.length).toFixed(1)}%)`);
    console.log(`✅ Has graduation year: ${applicants.length - missingGraduationYear} (${(100 * (applicants.length - missingGraduationYear) / applicants.length).toFixed(1)}%)`);
    console.log(`✅ Valid responses: ${applicants.length - emptyResponses}`);
    console.log('=' .repeat(50));
    
    // Critical issues
    const criticalIssues = missingEmail + missingFullName + emptyResponses + invalidStatus;
    
    console.log('\n🚨 Critical Issues:');
    console.log(`   Missing emails: ${missingEmail}`);
    console.log(`   Missing full names: ${missingFullName}`);
    console.log(`   Empty responses: ${emptyResponses}`);
    console.log(`   Invalid status: ${invalidStatus}`);
    
    if (criticalIssues > 0) {
      console.log(`\n❌ TOTAL CRITICAL ISSUES: ${criticalIssues}`);
    } else {
      console.log('\n✅ No critical issues found!');
    }
    
    // Warnings
    console.log('\n⚠️  Warnings:');
    console.log(`   Missing university: ${missingUniversity}`);
    console.log(`   Missing graduation year: ${missingGraduationYear}`);
    console.log(`   Decided_by inconsistencies: ${invalidDecidedBy}`);
    
    // Show sample of issues if any
    if (issues.length > 0) {
      console.log('\n📋 Sample Issues (first 20):');
      issues.slice(0, 20).forEach(issue => console.log(`   ${issue}`));
      if (issues.length > 20) {
        console.log(`   ... and ${issues.length - 20} more issues`);
      }
    }
    
    // Status breakdown
    const statusCounts = applicants.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\n📊 Status Breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      const pct = (100 * count / applicants.length).toFixed(1);
      console.log(`   ${status}: ${count} (${pct}%)`);
    });
    
    // Sample records
    console.log('\n📝 Sample Records (first 3):');
    applicants.slice(0, 3).forEach(a => {
      console.log(`\n   Email: ${a.email}`);
      console.log(`   Name: ${a.full_name}`);
      console.log(`   University: ${a.university || 'N/A'}`);
      console.log(`   Graduation: ${a.graduation_year || 'N/A'}`);
      console.log(`   Status: ${a.status}`);
      console.log(`   Responses fields: ${Object.keys(a.responses as any || {}).length}`);
    });
    
    console.log('\n✅ Verification complete!\n');
    
  } catch (err: any) {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
  }
}

// Run it
verifyData();


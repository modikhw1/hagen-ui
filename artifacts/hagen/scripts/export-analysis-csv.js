#!/usr/bin/env node
/**
 * Export Deep Analysis + Ratings to CSV
 * 
 * Flattens the nested visual_analysis JSON into columns
 * and joins with human ratings for correlation analysis.
 * 
 * Usage: node scripts/export-analysis-csv.js
 * Output: exports/analysis_export_YYYY-MM-DD.csv
 */

const fs = require('fs');
const path = require('path');

// Read the JSON data
const inputPath = process.argv[2] || '/tmp/rated_with_analysis.json';
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

console.log(`📊 Processing ${data.length} videos with ratings + deep analysis...\n`);

/**
 * Flatten nested object into dot-notation keys
 */
function flatten(obj, prefix = '', result = {}) {
  if (obj === null || obj === undefined) {
    result[prefix] = null;
    return result;
  }
  
  if (typeof obj !== 'object') {
    result[prefix] = obj;
    return result;
  }
  
  if (Array.isArray(obj)) {
    // For arrays, store length and first few items as string
    result[`${prefix}_count`] = obj.length;
    result[`${prefix}_list`] = obj.slice(0, 5).join('; ');
    return result;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    flatten(value, newKey, result);
  }
  
  return result;
}

/**
 * Extract and flatten one video record
 */
function processVideo(record) {
  const row = {};
  
  // Video identifiers
  row['video_id'] = record.video_id;
  row['video_url'] = record.video?.video_url || '';
  row['platform'] = record.video?.platform || '';
  
  // Human ratings (the ground truth)
  row['human_overall'] = record.overall_score;
  row['human_hook'] = record.dimensions?.hook;
  row['human_pacing'] = record.dimensions?.pacing;
  row['human_payoff'] = record.dimensions?.payoff;
  row['human_originality'] = record.dimensions?.originality;
  row['human_rewatchable'] = record.dimensions?.rewatchable;
  row['human_notes'] = (record.notes || '').replace(/[\n\r,]/g, ' ').substring(0, 500);
  row['human_tags'] = (record.tags || []).join('; ');
  
  // AI prediction (before human rated)
  const aiPred = record.video?.visual_analysis?.ai_prediction;
  if (aiPred) {
    row['ai_pred_overall'] = aiPred.overall;
    row['ai_pred_hook'] = aiPred.dimensions?.hook;
    row['ai_pred_pacing'] = aiPred.dimensions?.pacing;
    row['ai_pred_payoff'] = aiPred.dimensions?.payoff;
    row['ai_pred_originality'] = aiPred.dimensions?.originality;
    row['ai_pred_rewatchable'] = aiPred.dimensions?.rewatchable;
  }
  
  // Deep analysis features (flattened)
  const analysis = record.video?.visual_analysis;
  if (analysis) {
    // Skip these keys (already handled or meta)
    const skipKeys = ['ai_prediction', 'analyzed_at', 'analysis_model', 'feature_count'];
    
    for (const [category, content] of Object.entries(analysis)) {
      if (skipKeys.includes(category)) continue;
      flatten(content, category, row);
    }
    
    // Add meta
    row['analysis_model'] = analysis.analysis_model;
    row['feature_count'] = analysis.feature_count;
    row['analyzed_at'] = analysis.analyzed_at;
  }
  
  return row;
}

// Process all videos
const rows = data.map(processVideo);

// Collect all unique column names
const allColumns = new Set();
rows.forEach(row => Object.keys(row).forEach(k => allColumns.add(k)));
const columns = Array.from(allColumns).sort();

// Reorder: put identifiers and human ratings first
const priorityOrder = [
  'video_id', 'video_url', 'platform',
  'human_overall', 'human_hook', 'human_pacing', 'human_payoff', 'human_originality', 'human_rewatchable',
  'human_notes', 'human_tags',
  'ai_pred_overall', 'ai_pred_hook', 'ai_pred_pacing', 'ai_pred_payoff', 'ai_pred_originality', 'ai_pred_rewatchable',
];

const orderedColumns = [
  ...priorityOrder.filter(c => columns.includes(c)),
  ...columns.filter(c => !priorityOrder.includes(c))
];

// Create CSV
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const header = orderedColumns.join(',');
const csvRows = rows.map(row => 
  orderedColumns.map(col => escapeCSV(row[col])).join(',')
);

const csv = [header, ...csvRows].join('\n');

// Write output
const exportDir = path.join(__dirname, '..', 'exports');
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

const date = new Date().toISOString().split('T')[0];
const outputPath = path.join(exportDir, `analysis_export_${date}.csv`);
fs.writeFileSync(outputPath, csv);

console.log(`✅ Exported ${rows.length} videos to: ${outputPath}`);
console.log(`📊 Columns: ${orderedColumns.length}`);
console.log(`\n📋 Column categories:`);

// Group columns by prefix
const categories = {};
orderedColumns.forEach(col => {
  const prefix = col.split('.')[0];
  categories[prefix] = (categories[prefix] || 0) + 1;
});

Object.entries(categories)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count} columns`);
  });

console.log(`\n🔗 File ready for download at: exports/analysis_export_${date}.csv`);

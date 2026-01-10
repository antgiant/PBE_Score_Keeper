/**
 * Test to ensure no duplicate function definitions exist
 * This prevents issues where one script file overwrites functions from another
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('No duplicate function definitions across script files', () => {
  const scriptsDir = path.join(__dirname, '../../scripts');
  const scriptFiles = fs.readdirSync(scriptsDir)
    .filter(f => f.endsWith('.js') && !f.includes('.min.'));

  // Map of function name -> array of files where it's defined
  const functionLocations = new Map();

  // Regex to match function declarations
  // Matches: function name(...) or const/let/var name = function(...) or name = async function(...)
  const functionRegex = /(?:^|\s)(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function|(\w+)\s*=\s*(?:async\s+)?function)\s*\(/gm;

  for (const file of scriptFiles) {
    const filePath = path.join(scriptsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      // Get the function name (could be in any of the capture groups)
      const functionName = match[1] || match[2] || match[3];
      
      if (functionName) {
        if (!functionLocations.has(functionName)) {
          functionLocations.set(functionName, []);
        }
        functionLocations.get(functionName).push(file);
      }
    }
  }

  // Find duplicates
  const duplicates = [];
  for (const [funcName, files] of functionLocations.entries()) {
    if (files.length > 1) {
      duplicates.push({
        function: funcName,
        files: files
      });
    }
  }

  // Assert no duplicates found
  if (duplicates.length > 0) {
    const errorMsg = 'Duplicate function definitions found:\n' + 
      duplicates.map(d => `  - ${d.function} defined in: ${d.files.join(', ')}`).join('\n');
    assert.fail(errorMsg);
  }

  assert.ok(true, 'No duplicate functions found');
});

const path = require('node:path');

function formatDuration(durationMs) {
  if (durationMs === undefined || durationMs === null) {
    return '';
  }
  return `${durationMs.toFixed(2)} ms`;
}

function pad(value, width) {
  const text = String(value ?? '');
  if (text.length >= width) {
    return text;
  }
  return text + ' '.repeat(width - text.length);
}

module.exports = async function* tableReporter(source) {
  const fileSummaries = new Map();
  const failures = [];
  let overallSummary = null;

  for await (const event of source) {
    if (event.type === 'test:fail') {
      const { name, file, details } = event.data ?? {};
      failures.push({
        name,
        file,
        durationMs: details?.duration_ms,
      });
    }

    if (event.type === 'test:summary') {
      if (event.data?.file) {
        fileSummaries.set(event.data.file, event.data);
      } else {
        overallSummary = event.data;
      }
    }
  }

  const rows = Array.from(fileSummaries.entries())
    .map(([file, data]) => ({
      file: path.relative(process.cwd(), file),
      tests: data.counts?.tests ?? 0,
      passed: data.counts?.passed ?? 0,
      failed: data.counts?.failed ?? 0,
      skipped: data.counts?.skipped ?? 0,
      duration: formatDuration(data.duration_ms),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));

  const headers = ['File', 'Tests', 'Passed', 'Failed', 'Skipped', 'Duration'];
  const widths = headers.map((header, index) => {
    const values = rows.map((row) => {
      switch (index) {
        case 0:
          return row.file;
        case 1:
          return row.tests;
        case 2:
          return row.passed;
        case 3:
          return row.failed;
        case 4:
          return row.skipped;
        case 5:
          return row.duration;
        default:
          return '';
      }
    });
    return Math.max(header.length, ...values.map((value) => String(value).length));
  });

  let output = '';
  output += `${pad(headers[0], widths[0])}  ${pad(headers[1], widths[1])}  ${pad(headers[2], widths[2])}  ${pad(headers[3], widths[3])}  ${pad(headers[4], widths[4])}  ${pad(headers[5], widths[5])}\n`;
  output += `${'-'.repeat(widths[0])}  ${'-'.repeat(widths[1])}  ${'-'.repeat(widths[2])}  ${'-'.repeat(widths[3])}  ${'-'.repeat(widths[4])}  ${'-'.repeat(widths[5])}\n`;

  for (const row of rows) {
    output += `${pad(row.file, widths[0])}  ${pad(row.tests, widths[1])}  ${pad(row.passed, widths[2])}  ${pad(row.failed, widths[3])}  ${pad(row.skipped, widths[4])}  ${pad(row.duration, widths[5])}\n`;
  }

  if (overallSummary) {
    const { counts, duration_ms: durationMs } = overallSummary;
    output += '\n';
    output += `Total: ${counts.tests} tests, ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped, ${formatDuration(durationMs)}\n`;
  }

  if (failures.length) {
    output += '\nFailures:\n';
    for (const failure of failures) {
      const file = failure.file ? path.relative(process.cwd(), failure.file) : 'unknown';
      output += `- ${failure.name} (${file})${failure.durationMs ? ` - ${formatDuration(failure.durationMs)}` : ''}\n`;
    }
  }

  yield output;
};

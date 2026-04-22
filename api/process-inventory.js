const { processWinmarkCsv } = require('../scripts/winmark-processor');

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const csvText = body && typeof body === 'object' ? body.csvText : null;

    if (typeof csvText !== 'string' || !csvText.trim()) {
      return sendJson(res, 400, { error: 'Missing csvText string in request body' });
    }

    const result = processWinmarkCsv(csvText, { logColumns: true });
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, {
      error: 'Processing failed',
      details: error && error.message ? error.message : String(error),
    });
  }
};

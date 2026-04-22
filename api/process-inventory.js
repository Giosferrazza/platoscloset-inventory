import { spawn } from 'child_process';

function runPythonProcessor(payload) {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const scriptPath = `${process.cwd()}/scripts/process_inventory.py`;
    const child = spawn(pythonBin, [scriptPath], { cwd: process.cwd() });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python processor exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('Failed to parse Python processor output'));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const csvText = body?.csvText;
    if (!csvText || typeof csvText !== 'string') {
      return res.status(400).json({ error: 'Missing csvText string in request body' });
    }

    const result = await runPythonProcessor({ csvText });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Processing failed' });
  }
}

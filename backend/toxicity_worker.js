require('dotenv').config();
const PocketBase = require('pocketbase/cjs');

// ensure `fetch` is available (Node 18+ has global fetch). If not, fall back to node-fetch v2.
let fetchFunc = global.fetch;
if (!fetchFunc) {
  try {
    // node-fetch v2 supports CommonJS require
    fetchFunc = require('node-fetch');
  } catch (err) {
    console.warn('node-fetch not installed or failed to load; ML server calls may fail on older Node versions');
    fetchFunc = null;
  }
}

const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://127.0.0.1:8090');
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPass = process.env.POCKETBASE_ADMIN_PASSWORD;

async function init() {
  try {
    if (adminEmail && adminPass) {
      await pb.admins.authWithPassword(adminEmail, adminPass);
      console.log('PocketBase admin auth success');
    }

    await classifier.ensureClassifier();

    pb.collection('stream_messages').subscribe('*', async (e) => {
      try {
        if (e.action !== 'create') return;
        const record = e.record;
        const content = record.content || '';
        if (!content) return;

        let isToxic = false;
        let details = { source: 'local_classifier' };

        // try local ML server first (mask endpoint)
        const mlUrl = (process.env.ML_SERVER_URL || 'http://127.0.0.1:5000').replace(/\/$/, '') + '/mask';
        try {
          if (fetchFunc) {
            const resp = await fetchFunc(mlUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: content })
            });
            if (resp && resp.ok) {
              const data = await resp.json();
              isToxic = !!data.toxic;
              details = { source: 'ml_server', score: data.score };
              // if server returned a masked_text, use it when toxic
              if (isToxic && data.masked_text) {
                try {
                  await pb.collection('stream_messages').update(record.id, { content: data.masked_text, toxic: true });
                  console.log(`Message ${record.id} content masked by ML server`);
                } catch (uerr) {
                  console.warn('Failed to update message content with masked text', uerr && uerr.message);
                }
              }
            } else {
              const status = resp ? resp.status : 'no-response';
              console.warn('ML server returned non-ok status', status);
            }
          } else {
            console.warn('fetch not available in this Node runtime; falling back to local classifier');
          }
        } catch (err) {
          console.warn('Error calling local ML server, falling back to local classifier', err && err.message);
        }
        if (details.source === 'local_classifier') {
          const result = await classifier.classifyText(content);
          isToxic = result.label === 'toxic';
          details.score = { toxic: result.toxicScore, clean: result.cleanScore };
          if (isToxic) {
            // mask entire content as a fallback (preserve spaces)
            const masked = content.replace(/\S/g, '*');
            try {
              await pb.collection('stream_messages').update(record.id, { content: masked, toxic: true });
              console.log(`Message ${record.id} content masked by local classifier`);
            } catch (uerr) {
              console.warn('Failed to update message content with masked text (local)', uerr && uerr.message);
            }
          }
        }

        // update record with toxic flag (if not already updated with masked content)
        try {
          await pb.collection('stream_messages').update(record.id, { toxic: isToxic });
        } catch (uerr) {
          console.warn('Failed to update toxic flag on message', uerr && uerr.message);
        }

        console.log(`Message ${record.id} flagged as toxic=${isToxic} (details: ${JSON.stringify(details)})`);
      } catch (err) {
        console.error('Error processing message event', err);
      }
    });

    console.log('Toxicity worker subscribed to stream_messages (local classifier)');
  } catch (err) {
    console.error('Failed to start toxicity worker', err);
    process.exit(1);
  }
}

init();

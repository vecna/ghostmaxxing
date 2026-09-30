#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const root = path.resolve(__dirname, '..');
const backendRoot = path.resolve(root, '..', 'gstmxx-backend');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gstmxx-integration-'));
const clientDir = path.join(temporary, 'client-interface');
const dataDir = path.join(temporary, 'data');
const storageDir = path.join(temporary, 'storage');

async function main() {
  childProcess.execFileSync(process.execPath, [path.join(__dirname, 'install-client-interface.cjs')], {
    cwd: root,
    env: { ...process.env, GSTMXX_CLIENT_BUILD_DIR: clientDir },
    stdio: 'pipe',
  });

  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const selected = probe.address().port;
      probe.close(() => resolve(selected));
    });
  });

  Object.assign(process.env, {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    GSTMXX_PUBLIC_URL: `http://127.0.0.1:${port}`,
    GSTMXX_ALLOW_PRIVATE_ORIGIN: '1',
    GSTMXX_CLIENT_INTERFACE_DIR: clientDir,
    LAB_DATA_DIR: dataDir,
    GSTMXX_STORAGE_DIR: storageDir,
    LAB_POST_TOKEN: 'gallery-integration-token',
    GSTMXX_ADMIN_USER: 'integration-admin',
    GSTMXX_ADMIN_PASS: 'integration-secret',
  });

  const { createApp } = require(path.join(backendRoot, 'server.js'));
  const server = createApp().listen(port, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const origin = `http://127.0.0.1:${port}`;

  try {
    const uploadForm = new FormData();
    uploadForm.set('video', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'gallery.png');
    uploadForm.set('kind', 'clipboard');
    uploadForm.set('consent_version', 'integration-v1');
    uploadForm.set('ghostyle_id', 'brush');
    uploadForm.set('user_note', 'Integrated gallery picture');
    const uploaded = await fetch(`${origin}/api/uploads`, {
      method: 'POST',
      body: uploadForm,
    });
    assert.equal(uploaded.status, 201);
    const upload = await uploaded.json();
    const approved = await fetch(`${origin}/api/admin/approve/${upload.uploadId}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from('integration-admin:integration-secret').toString('base64')}` },
    });
    assert.equal(approved.status, 200);

    const lab = await fetch(`${origin}/lab.html`);
    assert.equal(lab.status, 200);
    assert.match(await lab.text(), /id="gm-gallery-grid"/);

    const clientModule = await fetch(`${origin}/lab-js/gallery.js`);
    assert.equal(clientModule.status, 200);
    assert.match(await clientModule.text(), /api\/gallery/);

    const gallery = await fetch(`${origin}/api/gallery?limit=24`, {
      headers: { Origin: 'http://localhost:8080' },
    });
    assert.equal(gallery.status, 200);
    assert.equal(gallery.headers.get('access-control-allow-origin'), '*');
    const body = await gallery.json();
    assert.equal(body.ok, true);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].content, 'Integrated gallery picture');
    assert.equal(body.items[0].ghostyleId, 'brush');
    assert.match(body.items[0].imageUrl, new RegExp(`^${origin}/clipboard/`));

    console.log(`Integrated gallery test passed at ${origin} using a staged client bundle.`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(temporary, { recursive: true, force: true }));

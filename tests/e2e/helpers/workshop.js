/**
 * Replaces model inference with controlled frame observations for Workshop UI tests.
 * The browser still drives the camera and application loops.
 */
export async function mockWorkshopDetector(page) {
   await page.addInitScript(() => {
      window.workshopDescriptor = 0;
   });
   await page.route('/lab-js/vendor/face-api.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: `
         const net = { loadFromUri: async () => {} };
         window.faceapi = {
            TinyFaceDetectorOptions: class {},
            nets: { tinyFaceDetector: net, faceLandmark68Net: net, faceRecognitionNet: net },
            detectSingleFace: frame => ({
               withFaceLandmarks: () => ({
                  withFaceDescriptor: async () => {
                     if (window.workshopDescriptor === null) return null;
                     const width = frame.videoWidth || frame.width;
                     const height = frame.videoHeight || frame.height;
                     const positions = Array.from({ length: 68 }, (_, index) => ({
                        x: width * (0.45 + 0.001 * index),
                        y: height * 0.5,
                     }));
                     const descriptor = new Float32Array(128);
                     descriptor[0] = window.workshopDescriptor;
                     return { descriptor, landmarks: { positions }, detection: {
                        box: { x: width / 4, y: height / 4, width: width / 2, height: height / 2 },
                     } };
                  },
               }),
            }),
         };
      `,
   }));
}

/** Collect browser ClipboardItem payloads without changing the system clipboard. */
export async function captureClipboardImages(page) {
   await page.addInitScript(() => {
      window.copiedImages = [];
      Object.defineProperty(navigator, 'clipboard', { value: {
         async write([item]) {
            const image = await item.getType('image/png');
            const text = await (await item.getType('text/plain')).text();
            const bitmap = await createImageBitmap(image);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d');
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            const videoHeight = document.getElementById('video').videoHeight;
            window.copiedImages.push({
               text,
               height: canvas.height,
               videoHeight,
               framePixel: [...context.getImageData(0, 0, 1, 1).data],
               footerPixel: [...context.getImageData(0, videoHeight, 1, 1).data],
            });
         },
      }});
   });
}

# Face engine bench — v0.1

Banco di prova indipendente da Lab, loader e database di Ghostmaxxing.
Copia questa cartella in `experiments/face-bench/` nel repository originale.
Nessun tool esistente viene modificato. Tutta l'inferenza avviene nel browser.

## Avvio

Da `experiments/face-bench`:

```bash
npm ci
npx playwright install chromium
npm run setup
npm run serve
```

Apri `http://127.0.0.1:8088/experiments/face-bench/`.
Seleziona motore, video di riferimento A e video da confrontare B, quindi Run.
Il primo avvio carica e verifica i modelli; non confrontare quel tempo con
l'inferenza a regime. La pagina mostra frame, bounding box, punti e tabella dei
punteggi, ed esporta un JSON completo. Cancel agisce fra due frame; una chiamata
sincrona già avviata deve terminare. Un esperimento interrotto non viene esportato.

I modelli face-api e MediaPipe vengono letti da `/lab-js/vendor/`, già presente
nel repository. Lo script setup scarica pico e i due gruppi ONNX (circa 55 MB).
Per scaricare un solo gruppo: `npm run setup -- yunet-sface`.
`models.lock.json` registra URL, dimensione, SHA-256 e riferimenti alle licenze;
setup rifiuta byte differenti da quelli collaudati. I pesi non sono inclusi nello
ZIP/patch. I pesi InsightFace hanno condizioni per ricerca non commerciale;
per altri usi serve una licenza appropriata. La licenza del codice non sostituisce
quella dei modelli. Per YuNet/SFace consultare le licenze delle rispettive cartelle
OpenCV Zoo.

## Runner headless e con finestra

```bash
node runner.mjs --engine yunet-sface \
  --reference /percorso/persona1-riferimento.webm \
  --probe /percorso/persona1-sessione2.webm \
  --fps 2 --max-frames 300 --gallery-limit 40 \
  --out results/yunet-sface.json
```

Aggiungi `--headed` per vedere l'elaborazione; `--screenshot results/frame.png`
salva l'ultima vista diagnostica. Puoi impostare
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` per usare un Chrome installato.
I video restano locali: il runner avvia un server sul loopback che li rende
accessibili solo al browser locale. Al termine chiude browser e server.

Il supporto MP4/H.264 dipende dai codec della build browser. Il Chromium headless
usato qui non ha decodificato H.264; i test passano con VP8/WebM. Se necessario:

```bash
ffmpeg -i input.mp4 -an -c:v libvpx-vp9 -b:v 0 -crf 30 output.webm
```

Conserva l'originale. Se converti, usa lo stesso file convertito per tutti i motori.
Il percorso `--visage-module` deve essere un URL locale servito dal repository,
per esempio `/experiments/face-bench/local-visage.mjs`, non un percorso filesystem.

## Motori e capacità

| ID | Landmark | Template / metrica | Stato |
| --- | --- | --- | --- |
| `face-api` | 68 punti 2D | FaceRecognitionNet, 128 valori, L2 | Implementato e collaudato |
| `mediapipe` | 478 punti, z relativo | MobileNetV3 Small sull'intero frame, 1024 valori, coseno | Implementato e collaudato; similarità generica di immagini |
| `pico` | Nessuno | Nessuno | Implementato e collaudato, sola detection |
| `scrfd-arcface` | 5 punti | buffalo_s / MobileFaceNet, 512 valori, coseno | Implementato e collaudato, ONNX WASM |
| `yunet-sface` | 5 punti | SFace, 128 valori, coseno | Implementato e collaudato, ONNX WASM |
| `visage` | Dipende dai moduli SDK | Template e confronto SDK | Richiede SDK/licenza e adapter reale; nessuna simulazione |

MediaPipe conserva i modelli e la semantica della pipeline `engine-3d.js`:
la mesh non è il fingerprint e l'ImageEmbedder vede anche lo sfondo. Non chiamare
quel punteggio una misura biometrica. Si usa IMAGE/CPU, mentre il Lab usa
VIDEO/GPU: il banco non replica tracking temporale, backend e stato dell'app.
Face-api mantiene TinyFaceDetector 416 / scoreThreshold 0.5, landmark e modello
recognition venduti nel repository. Nessun adapter importa lo stato del Lab.

## Contratto del bridge

`registry.mjs` crea adapter con `id`, `capabilities`, `metadata`, `load()`,
`detect(canvas)`, `compare(a,b)`, `reset()` e `dispose()`. `detect` restituisce un array di:

```js
{
  box: {x, y, width, height}, // pixel nel canvas analizzato
  confidence: null,          // oppure score nativo, non calibrato fra motori
  landmarkSchema: 'five-point-2d',
  points: [{x, y, name}],    // z, se presente, mantiene le unità del suo schema
  template: {space, metric, values, kind} // oppure null
}
```

L'adapter ONNX gestisce resize, ordine canali, decoding, NMS e allineamento.
Le coordinate x/y tornano allo spazio del frame; z MediaPipe è relativo, non
una profondità metrica. Non si inventano landmark per pico. In `core.mjs`
il confronto rifiuta spazi, metriche e dimensioni incompatibili; il runner
aggiunge all'identificatore del template un hash di pesi e preprocessing.
Il confronto di template vettoriali è indipendente dal framework.

Visage è un confine esplicito: un modulo locale con `export async function
createEngine(options)` deve restituire un adapter conforme usando il loro SDK.
Questa versione non implementa le API proprietarie non disponibili. Il runner
accetta anche `compare(a,b)` asincrono: un SDK con template opachi può usare
`metric: 'native-sdk'`, mantenere i suoi dati nel template e dichiarare
`metadata.higherIsCloser`. L'adapter deve usare `metadata.templateSpace` per
identificare i template e fornire gli hash/versioni dei propri modelli. Non si
convertono template opachi in vettori fittizi.

## Video, raccolta e significato dei punteggi

I video vengono decodificati e fermati ai timestamp programmati, senza saltare
frame quando il motore è lento. Ogni inferenza termina prima della successiva.
Default: 2 campioni/s, massimo 300 frame per video, larghezza massima 960 px.
Il limite frame tronca il campionamento alla parte iniziale; il report lo indica
con `capped`. Per clip lunghe aumenta `--max-frames`.

Si considera valido per il riferimento solo un frame con un volto e template
estratto. In presenza di più volti non viene scelta un'identità automaticamente.
La galleria contiene al massimo 40 template, distribuiti cronologicamente fra
quelli validi. Il limite può produrre meno di 40 riferimenti: confrontare tra
esperimenti il numero effettivo, non solo quello richiesto.

Ogni template di B viene confrontato con tutti i template selezionati di A.
Il JSON contiene score migliore, timestamp del riferimento migliore e mediana
dei migliori k (default 5, oppure meno se la galleria è piccola). Per L2 è meglio
un valore basso; per coseno è meglio un valore alto. Non si convertono in una
percentuale universale e non si impone una soglia di identità arbitraria.

Gli stati distinguono: nessun volto, più volti, sola detection, template
estratto, confronto, riferimento assente, allineamento/template fallito ed
errore d'inferenza. Errori e mancata detection non diventano similarità zero.
Il report include dimensioni, timestamp, hash SHA-256 dei pixel campionati,
hash degli asset, impostazioni, browser, backend e tempi senza warm-up.
Il JSON include i template: trattalo come parte dei dati del tuo esperimento.

Il primo corpus utile è A=persona 1 pulita, B=stessa persona in nuova ripresa,
C=persona 1 con intervento, D=persona 2 pulita. Clip da 15–25 secondi, luce e
camera inizialmente costanti. Il self-match della stessa clip è uno smoke test,
non una validazione dell'accuratezza né una calibrazione delle soglie.

## Overlay e Ghostyle

`overlay.mjs` distingue due operazioni:

* `applyOverlay`: disegna poligoni normalizzati sui pixel del SOLO video B,
  prima dell'inferenza. `--overlay overlay-example.json` usa lo stesso intervento
  per tutti i motori; il JSON del report ne conserva la definizione.
* `drawDiagnostics`: disegna box e punti su un canvas separato DOPO l'inferenza;
  la grafica diagnostica non entra nei fingerprint.

Questa prima versione usa overlay statici nello spazio dell'immagine, non
ancorati al volto. I Ghostyle attuali `onDraw` face-api e `paintUV` MediaPipe non
sono caricati né convertiti: i loro requisiti 2D/3D rimangono veri. Si possono
confrontare anche due video già registrati con un intervento reale.

## Verifica

```bash
npm test
npm run test:browser
```

`npm test`: sette test su compatibilità template, ordinamento delle metriche,
campionamento, allineamento, NMS e decoding SCRFD. I test browser sono disattivati
nel comando base. `test:browser` esegue i cinque motori reali sul fixture
`tests/fixtures/face-descriptor.webm` e verifica un overlay nero completo:
la detection deve sparire e non deve comparire un punteggio zero fittizio.
Vedi `VALIDATION.md` per i risultati e i limiti del collaudo.

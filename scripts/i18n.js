/**
 * Centralized translation strings.
 * Runtime: `i18n(key, locale)` returns localized string or English fallback.
 *
 * Baseline notes:
 * - English is the source baseline and default locale.
 * - Existing Italian copy is preserved exactly where it already appeared in code.
 */

export const DEFAULT_LOCALE = 'en';
export const supportedLocales = ['en', 'it', 'pt'];
export const localeNames = {
   en: 'English',
   it: 'Italiano',
   pt: 'Português',
};

export const localeFlags = {
   en: '🇬🇧',
   it: '🇮🇹',
   pt: '🇵🇹',
};

export const LOCALE_STORAGE_KEY = 'ghostmaxxing-locale';

export const messages = {
   transfer_page_title: {
      context: 'ghostyle-transfer.html:7; scripts/transfer.js:143',
      it: 'Trasferimento Ghostyle — Ghostmaxxing',
      en: 'Ghostyle Transfer — Ghostmaxxing',
      pt: 'Transferencia de Ghostyle — Ghostmaxxing',
      notes: 'Glossary: Ghostyle.',
   },
   transfer_kicker: {
      context: 'ghostyle-transfer.html:50',
      it: 'Lab · trasferimento Ghostyle',
      en: 'Lab · Ghostyle transfer',
      pt: 'Lab · transferencia de Ghostyle',
      notes: 'Glossary: Ghostyle.',
   },
   transfer_title: {
      context: 'ghostyle-transfer.html:51',
      it: 'Solleva un Ghostyle da un volto, indossalo su un altro.',
      en: 'Lift a Ghostyle off one face, wear it on another.',
      pt: 'Extraia um Ghostyle de um rosto e use em outro.',
      notes: 'Glossary: Ghostyle.',
   },
   transfer_lead: {
      context: 'ghostyle-transfer.html:52',
      it: 'Estrai il trucco da una coppia prima / dopo del workshop e posizionalo su un volto target.',
      en: 'Extract the paint from a workshop before / after pair and place it on a target face.',
      pt: 'Extraia a pintura de um par antes / depois do workshop e coloque-a em um rosto alvo.',
   },
   transfer_deck: {
      context: 'ghostyle-transfer.html:55',
      it: 'Segna il volto su ogni immagine con un riquadro. Il trasferimento avviene interamente su questo dispositivo, con allineamento mesh quando il motore locale riesce a rilevare landmark compatibili.',
      en: 'Mark the face on each image with a box. The transfer runs entirely on this device, with mesh alignment when the local face engine can detect matching landmarks.',
      pt: 'Marque o rosto em cada imagem com uma caixa. A transferencia roda inteiramente neste dispositivo, com alinhamento por malha quando o motor local consegue detectar landmarks compativeis.',
      notes: 'Glossary: mesh, landmarks.',
   },
   transfer_engine_loading: {
      context: 'ghostyle-transfer.html:60; scripts/transfer.js:26',
      it: 'Motore mesh: caricamento…',
      en: 'Mesh engine: loading…',
      pt: 'Motor de malha: carregando…',
      notes: 'Glossary: mesh.',
   },
   transfer_engine_unavailable: {
      context: 'scripts/transfer.js:160',
      it: 'Motore mesh: non disponibile, solo modalità riquadro',
      en: 'Mesh engine: unavailable, box mode only',
      pt: 'Motor de malha: indisponivel, somente modo caixa',
      notes: 'Glossary: mesh.',
   },
   transfer_engine_ready: {
      context: 'scripts/transfer.js:169',
      it: 'Motore mesh: pronto (face-api 68pt)',
      en: 'Mesh engine: ready (face-api 68pt)',
      pt: 'Motor de malha: pronto (face-api 68pt)',
      notes: 'Glossary: mesh, face-api.',
   },
   transfer_engine_failed: {
      context: 'scripts/transfer.js:171',
      it: 'Motore mesh: modelli non caricati, solo modalità riquadro',
      en: 'Mesh engine: models failed, box mode only',
      pt: 'Motor de malha: modelos falharam, somente modo caixa',
      notes: 'Glossary: mesh.',
   },
   transfer_workbench_label: {
      context: 'ghostyle-transfer.html:65',
      it: 'Banco di lavoro per trasferimento Ghostyle',
      en: 'Ghostyle transfer workbench',
      pt: 'Bancada de transferencia de Ghostyle',
      notes: 'Glossary: Ghostyle.',
   },
   transfer_before_title: {
      context: 'ghostyle-transfer.html:70',
      it: 'Prima',
      en: 'Before',
      pt: 'Antes',
   },
   transfer_before_tag: {
      context: 'ghostyle-transfer.html:71',
      it: 'volto senza trucco · opzionale',
      en: 'bare face · optional',
      pt: 'rosto sem pintura · opcional',
   },
   transfer_before_hint: {
      context: 'ghostyle-transfer.html:74',
      it: 'Trascina o scegli il volto senza trucco del workshop',
      en: 'Drop or choose the bare workshop face',
      pt: 'Solte ou escolha o rosto sem pintura do workshop',
   },
   transfer_after_title: {
      context: 'ghostyle-transfer.html:86',
      it: 'Dopo',
      en: 'After',
      pt: 'Depois',
   },
   transfer_after_tag: {
      context: 'ghostyle-transfer.html:87',
      it: 'volto truccato',
      en: 'painted face',
      pt: 'rosto pintado',
   },
   transfer_after_hint: {
      context: 'ghostyle-transfer.html:90',
      it: 'Trascina o scegli il volto truccato del workshop',
      en: 'Drop or choose the painted workshop face',
      pt: 'Solte ou escolha o rosto pintado do workshop',
   },
   transfer_target_title: {
      context: 'ghostyle-transfer.html:102',
      it: 'Target',
      en: 'Target',
      pt: 'Alvo',
   },
   transfer_target_tag: {
      context: 'ghostyle-transfer.html:103',
      it: 'riceve il trucco',
      en: 'receives the paint',
      pt: 'recebe a pintura',
   },
   transfer_target_hint: {
      context: 'ghostyle-transfer.html:106',
      it: 'Trascina o scegli il volto / dipinto target',
      en: 'Drop or choose the target face / painting',
      pt: 'Solte ou escolha o rosto / pintura alvo',
   },
   transfer_choose_image: {
      context: 'ghostyle-transfer.html:79; ghostyle-transfer.html:95; ghostyle-transfer.html:111',
      it: 'Scegli immagine',
      en: 'Choose image',
      pt: 'Escolher imagem',
   },
   transfer_sensitivity_label: {
      context: 'ghostyle-transfer.html:120',
      it: 'Sensibilità trucco',
      en: 'Paint sensitivity',
      pt: 'Sensibilidade da pintura',
   },
   transfer_feather_label: {
      context: 'ghostyle-transfer.html:124',
      it: 'Sfumatura bordo',
      en: 'Edge feather',
      pt: 'Suavizacao da borda',
   },
   transfer_opacity_label: {
      context: 'ghostyle-transfer.html:128',
      it: 'Opacità',
      en: 'Opacity',
      pt: 'Opacidade',
   },
   transfer_blend_label: {
      context: 'ghostyle-transfer.html:132',
      it: 'Fusione',
      en: 'Blend',
      pt: 'Mesclagem',
   },
   transfer_blend_multiply: {
      context: 'ghostyle-transfer.html:134',
      it: 'Moltiplica (dipinge sopra)',
      en: 'Multiply (paints onto)',
      pt: 'Multiplicar (pinta por cima)',
   },
   transfer_blend_normal: {
      context: 'ghostyle-transfer.html:135',
      it: 'Normale',
      en: 'Normal',
      pt: 'Normal',
   },
   transfer_blend_soft_light: {
      context: 'ghostyle-transfer.html:136',
      it: 'Luce soffusa',
      en: 'Soft light',
      pt: 'Luz suave',
   },
   transfer_use_mesh_label: {
      context: 'ghostyle-transfer.html:142',
      it: 'Segui i lineamenti (mesh)',
      en: 'Follow features (mesh)',
      pt: 'Seguir feicoes (malha)',
      notes: 'Glossary: mesh.',
   },
   transfer_run_button: {
      context: 'ghostyle-transfer.html:147',
      it: 'Trasferisci Ghostyle',
      en: 'Transfer Ghostyle',
      pt: 'Transferir Ghostyle',
      notes: 'Glossary: Ghostyle.',
   },
   transfer_download_button: {
      context: 'ghostyle-transfer.html:148',
      it: 'Scarica risultato',
      en: 'Download result',
      pt: 'Baixar resultado',
   },
   transfer_reset_button: {
      context: 'ghostyle-transfer.html:149',
      it: 'Reimposta',
      en: 'Reset',
      pt: 'Redefinir',
   },
   transfer_msg_load_after_target: {
      context: 'ghostyle-transfer.html:150; scripts/transfer.js:27; scripts/transfer.js:337',
      it: 'Carica un dopo e un target, poi disegna un riquadro su ogni volto.',
      en: 'Load an after and a target, then draw a box on each face.',
      pt: 'Carregue um depois e um alvo, depois desenhe uma caixa em cada rosto.',
   },
   transfer_msg_ready: {
      context: 'scripts/transfer.js:337',
      it: 'Pronto. Premi Trasferisci Ghostyle.',
      en: 'Ready. Press Transfer Ghostyle.',
      pt: 'Pronto. Pressione Transferir Ghostyle.',
      notes: 'Glossary: Ghostyle.',
   },
   transfer_msg_extracting: {
      context: 'scripts/transfer.js:670',
      it: 'Estrazione del trucco…',
      en: 'Extracting paint…',
      pt: 'Extraindo pintura…',
   },
   transfer_msg_detecting: {
      context: 'scripts/transfer.js:699',
      it: 'Rilevamento landmark…',
      en: 'Detecting landmarks…',
      pt: 'Detectando landmarks…',
      notes: 'Glossary: landmarks.',
   },
   transfer_msg_done: {
      context: 'scripts/transfer.js:753',
      it: 'Fatto.',
      en: 'Done.',
      pt: 'Concluido.',
   },
   transfer_msg_error: {
      context: 'scripts/transfer.js:807',
      it: 'Errore: {message}',
      en: 'Error: {message}',
      pt: 'Erro: {message}',
   },
   transfer_note_box_set: {
      context: 'scripts/transfer.js:316',
      it: 'riquadro volto impostato',
      en: 'face box set',
      pt: 'caixa do rosto definida',
   },
   transfer_note_draw_box: {
      context: 'scripts/transfer.js:318',
      it: 'disegna un riquadro sul volto',
      en: 'draw a box over the face',
      pt: 'desenhe uma caixa sobre o rosto',
   },
   transfer_result_empty: {
      context: 'ghostyle-transfer.html:155; scripts/transfer.js:126',
      it: 'Il risultato trasferito apparirà qui.',
      en: 'The transferred result will appear here.',
      pt: 'O resultado transferido aparecera aqui.',
   },
   transfer_matte_title: {
      context: 'ghostyle-transfer.html:160',
      it: 'Trucco estratto',
      en: 'Extracted paint',
      pt: 'Pintura extraida',
   },
   transfer_matte_note: {
      context: 'ghostyle-transfer.html:162',
      it: 'Il Ghostyle isolato, in un frame volto normalizzato.',
      en: 'The isolated Ghostyle, in a normalized face frame.',
      pt: 'O Ghostyle isolado, em um quadro de rosto normalizado.',
      notes: 'Glossary: Ghostyle.',
   },
   transfer_mode_title: {
      context: 'ghostyle-transfer.html:165',
      it: 'Modalità',
      en: 'Mode',
      pt: 'Modo',
   },
   transfer_mode_not_run: {
      context: 'ghostyle-transfer.html:166; scripts/transfer.js:28',
      it: 'Non ancora eseguito.',
      en: 'Not run yet.',
      pt: 'Ainda nao executado.',
   },
   transfer_mode_placed: {
      context: 'scripts/transfer.js:103',
      it: 'Posizionato con: {mode}',
      en: 'Placed using: {mode}',
      pt: 'Posicionado usando: {mode}',
   },
   transfer_mode_box: {
      context: 'scripts/transfer.js:697',
      it: 'riquadro',
      en: 'box',
      pt: 'caixa',
   },
   transfer_mode_mesh: {
      context: 'scripts/transfer.js:736',
      it: 'mesh ({count} triangoli)',
      en: 'mesh ({count} triangles)',
      pt: 'malha ({count} triangulos)',
      notes: 'Glossary: mesh.',
   },
   transfer_mode_box_no_face: {
      context: 'scripts/transfer.js:748',
      it: 'riquadro (nessun volto rilevato)',
      en: 'box (no face detected)',
      pt: 'caixa (nenhum rosto detectado)',
   },
   transfer_mode_box_unavailable: {
      context: 'scripts/transfer.js:750',
      it: 'riquadro (motore mesh non disponibile)',
      en: 'box (mesh engine unavailable)',
      pt: 'caixa (motor de malha indisponivel)',
      notes: 'Glossary: mesh.',
   },
   transfer_disclaimer: {
      context: 'ghostyle-transfer.html:174',
      it: 'Ghostmaxxing è uno strumento di ricerca e formazione. Trasferire un Ghostyle su un volto è una visualizzazione; non è una prova che il pattern influisca su un sistema di riconoscimento. I rilevatori di volti sono inaffidabili sulle opere stilizzate. Se la mesh non trova un volto target, lo strumento usa il riquadro che hai disegnato.',
      en: 'Ghostmaxxing is a research and education tool. Transferring a Ghostyle onto a face is a visualization; it is not evidence that the pattern affects any recognition system. Face detectors are unreliable on stylized artwork. If the mesh cannot find a target face, the tool uses the box you drew.',
      pt: 'Ghostmaxxing e uma ferramenta de pesquisa e educacao. Transferir um Ghostyle para um rosto e uma visualizacao; nao e prova de que o padrao afete qualquer sistema de reconhecimento. Detectores de rosto nao sao confiaveis em arte estilizada. Se a malha nao encontrar um rosto alvo, a ferramenta usa a caixa que voce desenhou.',
      notes: 'Glossary: Ghostyle, mesh, face recognition.',
   },
   status_initialising: {
      context: 'lab.html:30',
      it: 'inizializzazione…',
      en: 'initialising…',
      pt: 'iniciando…',
   },
   placeholder_loading_webcam: {
      context: 'lab.html:31',
      it: 'Caricamento modelli e richiesta della webcam…',
      en: 'Loading models and requesting the webcam…',
      pt: 'Carregando modelos e solicitando a webcam…',
   },
   diagnostic_preview_alt: {
      context: 'lab.html:33',
      it: 'anteprima diagnostica',
      en: 'diagnostic preview',
      pt: 'prévia de diagnóstico',
   },
   face_view_tablist_label: {
      context: 'lab.html:46',
      it: 'Cosa vedi sul volto',
      en: 'What you see on the face',
      pt: 'O que você vê no rosto',
   },
   nav_home_label: {
      context: 'lab.html:47',
      it: 'Home',
      en: 'Home',
      pt: 'Início',
   },
   view_camera: {
      context: 'lab.html:55',
      it: 'Camera',
      en: 'Camera',
      pt: 'Câmera',
   },
   view_2d_points: {
      context: 'lab.html:56',
      it: 'Punti 2D',
      en: '2D points',
      pt: 'Pontos 2D',
      notes: 'Glossary: 2D points.',
   },
   view_3d_mesh: {
      context: 'lab.html:57',
      it: 'Mesh 3D',
      en: '3D mesh',
      pt: 'Malha 3D',
      notes: 'Glossary: 3D mesh.',
   },
   save_your_face_status: {
      context: 'lab.html:63; scripts/lab-ui.js:295',
      it: 'Salva il tuo volto',
      en: 'Save your face',
      pt: 'Salve seu rosto',
   },
   match_label: {
      context: 'lab.html:60',
      it: 'MATCH',
      en: 'MATCH',
      pt: 'MATCH',
      notes: 'Glossary: match.',
   },
   copy_to_clipboard_title: {
      context: 'lab.html:71',
      it: 'Copia negli appunti',
      en: 'Copy to clipboard',
      pt: 'Copiar para a área de transferência',
   },
   copy_button: {
      context: 'lab.html:73',
      it: 'Copia',
      en: 'Copy',
      pt: 'Copiar',
   },
   pinned_ghostyle_1_title: {
      context: 'lab.html:76',
      it: 'Ghostyle fissato 1',
      en: 'Pinned Ghostyle 1',
      pt: 'Ghostyle fixado 1',
      notes: 'Glossary: Ghostyle, pinned.',
   },
   pinned_ghostyle_2_title: {
      context: 'lab.html:80',
      it: 'Ghostyle fissato 2',
      en: 'Pinned Ghostyle 2',
      pt: 'Ghostyle fixado 2',
      notes: 'Glossary: Ghostyle, pinned.',
   },
   record_2s_title: {
      context: 'lab.html:84',
      it: 'Registra 2s',
      en: 'Record 2s',
      pt: 'Gravar 2s',
   },
   record_button: {
      context: 'lab.html:86',
      it: 'Registra',
      en: 'Record',
      pt: 'Gravar',
   },
   language_label: {
      context: 'lab.html:118',
      it: 'Lingua',
      en: 'Language',
      pt: 'Idioma',
   },
   language_help: {
      context: 'lab.html:118',
      it: 'Lingua dell\'interfaccia',
      en: 'Interface language',
      pt: 'Idioma da interface',
   },
   saved_faces_title: {
      context: 'lab.html:92; lab.html:95; lab.html:210',
      it: 'Volti salvati',
      en: 'Saved faces',
      pt: 'Rostos salvos',
   },
   close_button: {
      context: 'lab.html:93; lab.html:102; lab.html:169; lab.html:180; lab.html:191; lab.html:238; lab.html:255',
      it: 'Chiudi',
      en: 'Close',
      pt: 'Fechar',
   },
   on_device_kicker: {
      context: 'lab.html:94; lab.html:103; lab.html:205',
      it: 'Sul dispositivo',
      en: 'On device',
      pt: 'No dispositivo',
   },
   saved_faces_description: {
      context: 'lab.html:96',
      it: 'Baseline salvate su questo dispositivo. Il match viene misurato rispetto a quella attiva.',
      en: 'Baselines stored on this device. The match is measured against the active one.',
      pt: 'Bases salvas neste dispositivo. A correspondência é medida contra a base ativa.',
      notes: 'Glossary: baseline, match.',
   },
   settings_title: {
      context: 'lab.html:101; lab.html:104; lab.html:212',
      it: 'Impostazioni',
      en: 'Settings',
      pt: 'Configurações',
   },
   lab_intro_note: {
      context: 'lab.html:106',
      it: 'Laboratorio Web AR in tempo reale per sviluppare camouflage contro il riconoscimento facciale.',
      en: 'Real-time Web AR lab for developing face-recognition camouflage.',
      pt: 'Laboratório Web AR em tempo real para desenvolver camuflagem contra reconhecimento facial.',
      notes: 'Glossary: Web AR, face recognition, camouflage.',
   },
   ghostyles_heading: {
      context: 'lab.html:109',
      it: 'Ghostyle',
      en: 'Ghostyles',
      pt: 'Ghostyles',
      notes: 'Glossary: Ghostyle.',
   },
   camera_heading: {
      context: 'lab.html:117',
      it: 'Camera',
      en: 'Camera',
      pt: 'Câmera',
   },
   front_back_hint: {
      context: 'lab.html:118',
      it: 'Frontale / posteriore',
      en: 'Front / back',
      pt: 'Frontal / traseira',
   },
   fullscreen_label: {
      context: 'lab.html:120',
      it: 'Schermo intero',
      en: 'Fullscreen',
      pt: 'Tela cheia',
   },
   fullscreen_help: {
      context: 'lab.html:120',
      it: 'Riempi lo schermo',
      en: 'Fill the screen',
      pt: 'Preencher a tela',
   },
   ghostyles_defaults_note: {
      context: 'lab.html:110',
      it: 'I predefiniti arrivano dalle prime due voci in ghostyles.json.',
      en: 'Defaults come from the first two entries in ghostyles.json.',
      pt: 'Os padrões vêm das duas primeiras entradas em ghostyles.json.',
      notes: 'Glossary: ghostyles.json.',
   },
   reload_ghostyles_button: {
      context: 'lab.html:113',
      it: 'Ricarica Ghostyle',
      en: 'Reload Ghostyles',
      pt: 'Recarregar Ghostyles',
      notes: 'Glossary: Ghostyle.',
   },
   flip_camera_label: {
      context: 'lab.html:118; lab.html:119',
      it: 'Cambia fotocamera',
      en: 'Flip camera',
      pt: 'Trocar câmera',
   },
   enter_fullscreen_button: {
      context: 'lab.html:121; scripts/lab-ui.js:118',
      it: 'Entra in schermo intero',
      en: 'Enter fullscreen',
      pt: 'Entrar em tela cheia',
   },
   exit_fullscreen_button: {
      context: 'scripts/lab-ui.js:116',
      it: 'Esci dallo schermo intero',
      en: 'Exit fullscreen',
      pt: 'Sair da tela cheia',
   },
   mirror_preview_label: {
      context: 'lab.html:122',
      it: 'Anteprima speculare',
      en: 'Mirror preview',
      pt: 'Prévia espelhada',
   },
   mirror_preview_help: {
      context: 'lab.html:122',
      it: 'Specchia l\'immagine, non la camera',
      en: 'Flip the image, not the camera',
      pt: 'Espelha a imagem, não a câmera',
   },
   variables_heading: {
      context: 'lab.html:127',
      it: 'Variabili',
      en: 'Variables',
      pt: 'Variáveis',
   },
   hardcoded_note: {
      context: 'lab.html:127',
      it: '(normalmente hardcoded)',
      en: '(normally hardcoded)',
      pt: '(normalmente fixas no código)',
      notes: 'Glossary: hardcoded.',
   },
   match_threshold_label: {
      context: 'lab.html:128; lab.html:154',
      it: 'Soglia di riconoscimento',
      en: 'Match threshold',
      pt: 'Limite de correspondência',
      notes: 'Glossary: match threshold.',
   },
   match_threshold_help: {
      context: 'lab.html:128',
      it: 'Distanza sopra cui è "nessuna corrispondenza"',
      en: 'Distance above which it is "no match"',
      pt: 'Distância acima da qual é "sem correspondência"',
      notes: 'Glossary: distance, no match.',
   },
   analysis_frequency_label: {
      context: 'lab.html:130',
      it: 'Frequenza di analisi',
      en: 'Analysis frequency',
      pt: 'Frequência da análise',
   },
   analysis_frequency_help: {
      context: 'lab.html:130',
      it: 'Quanto spesso il match viene rimisurato',
      en: 'How often the match is re-measured',
      pt: 'Com que frequência a correspondência é medida de novo',
      notes: 'Glossary: match.',
   },
   fps_option_heavy: {
      context: 'lab.html:134',
      it: '30 ms · pesante',
      en: '30 ms · heavy',
      pt: '30 ms · pesado',
   },
   fps_option_fast: {
      context: 'lab.html:135',
      it: '60 ms · veloce',
      en: '60 ms · fast',
      pt: '60 ms · rápido',
   },
   fps_option_medium: {
      context: 'lab.html:136',
      it: '90 ms · medio',
      en: '90 ms · medium',
      pt: '90 ms · médio',
   },
   fps_option_battery: {
      context: 'lab.html:137',
      it: '120 ms · leggero sulla batteria',
      en: '120 ms · easy on battery',
      pt: '120 ms · leve para a bateria',
   },
   estimated_opacity_label: {
      context: 'lab.html:137',
      it: 'Opacità stimata',
      en: 'Estimated opacity',
      pt: 'Opacidade estimada',
   },
   estimated_opacity_help: {
      context: 'lab.html:137',
      it: 'Forza predefinita del Ghostyle',
      en: 'Default Ghostyle strength',
      pt: 'Força padrão do Ghostyle',
      notes: 'Glossary: Ghostyle.',
   },
   faces_heading: {
      context: 'lab.html:142; lab.html:211',
      it: 'Volti',
      en: 'Faces',
      pt: 'Rostos',
   },
   delete_all_faces_label: {
      context: 'lab.html:143',
      it: 'Cancella tutti i volti',
      en: 'Delete all faces',
      pt: 'Excluir todos os rostos',
   },
   delete_all_faces_help: {
      context: 'lab.html:143',
      it: 'Cancella ogni baseline salvata su questo dispositivo',
      en: 'Wipes every saved baseline on this device',
      pt: 'Apaga todas as bases salvas neste dispositivo',
      notes: 'Glossary: baseline.',
   },
   delete_all_button: {
      context: 'lab.html:144',
      it: 'Cancella tutto',
      en: 'Delete all',
      pt: 'Excluir tudo',
   },
   analyze_current_frame_label: {
      context: 'lab.html:145',
      it: 'Analizza frame corrente',
      en: 'Analyze current frame',
      pt: 'Analisar quadro atual',
      notes: 'Glossary: frame.',
   },
   analyze_current_frame_help: {
      context: 'lab.html:145',
      it: 'Apri la diagnostica prima/dopo',
      en: 'Open the before/after diagnostic',
      pt: 'Abrir o diagnóstico antes/depois',
   },
   analyze_button: {
      context: 'lab.html:146',
      it: 'Analizza',
      en: 'Analyze',
      pt: 'Analisar',
   },
   archive_mode_heading: {
      context: 'lab.html:152',
      it: 'Archivio e modalità',
      en: 'Archive & mode',
      pt: 'Arquivo e modo',
   },
   saved_faces_metric: {
      context: 'lab.html:154',
      it: 'Volti salvati',
      en: 'Saved faces',
      pt: 'Rostos salvos',
   },
   next_id_metric: {
      context: 'lab.html:155',
      it: 'Prossimo ID',
      en: 'Next ID',
      pt: 'Próximo ID',
   },
   active_effect_metric: {
      context: 'lab.html:157',
      it: 'Effetto attivo',
      en: 'Active effect',
      pt: 'Efeito ativo',
   },
   tracking_metric: {
      context: 'lab.html:158',
      it: 'Tracciamento',
      en: 'Tracking',
      pt: 'Rastreamento',
      notes: 'Glossary: tracking.',
   },
   logs_heading: {
      context: 'lab.html:163',
      it: 'Log',
      en: 'Logs',
      pt: 'Registros',
   },
   waiting_webcam_log: {
      context: 'lab.html:162',
      it: 'In attesa che la webcam si avvii…',
      en: 'Waiting for the webcam to start…',
      pt: 'Aguardando a webcam iniciar…',
   },
   online_kicker: {
      context: 'lab.html:170; lab.html:181; lab.html:192; lab.html:218',
      it: 'Online',
      en: 'Online',
      pt: 'Online',
   },
   upload_report_title: {
      context: 'lab.html:168; lab.html:171; lab.html:220',
      it: 'Carica e segnala',
      en: 'Upload & report',
      pt: 'Enviar e relatar',
   },
   upload_report_description: {
      context: 'lab.html:172',
      it: 'Invia una clip registrata o una prova di un sistema reale. Passa da internet: condividi solo ciò che per te è sicuro.',
      en: 'Send a recorded clip or evidence of a real-world deployment. Goes over the internet — share only what is safe for you.',
      pt: 'Envie um clipe gravado ou prova de uma instalação real. Vai pela internet: compartilhe só o que for seguro para você.',
   },
   share_clip_title: {
      context: 'lab.html:174',
      it: 'Condividi una clip',
      en: 'Share a clip',
      pt: 'Compartilhar um clipe',
   },
   no_clips_recorded: {
      context: 'lab.html:174; scripts/lab-ui.js:142',
      it: 'Nessuna clip registrata.',
      en: 'No clips recorded yet.',
      pt: 'Nenhum clipe gravado ainda.',
   },
   clips_ready_to_send: {
      context: 'scripts/lab-ui.js:142',
      it: '{count} clip pronte da inviare.',
      en: '{count} clip(s) ready to send.',
      pt: '{count} clipe(s) prontos para enviar.',
   },
   report_deployment_title: {
      context: 'lab.html:175',
      it: 'Segnala un deployment',
      en: 'Report a deployment',
      pt: 'Relatar uma instalação',
      notes: 'Glossary: deployment.',
   },
   report_deployment_description: {
      context: 'lab.html:175',
      it: 'Dove il riconoscimento facciale appare nello spazio pubblico, chi lo gestisce, che aspetto ha.',
      en: 'Where face recognition appears in public space, who runs it, what it looks like.',
      pt: 'Onde o reconhecimento facial aparece no espaço público, quem opera e como ele se parece.',
      notes: 'Glossary: face recognition.',
   },
   shared_gallery_title: {
      context: 'lab.html:179; lab.html:182; lab.html:223',
      it: 'Galleria condivisa',
      en: 'Shared gallery',
      pt: 'Galeria compartilhada',
   },
   shared_gallery_description: {
      context: 'lab.html:183',
      it: 'Risultati e clip pubblicati dalla community. Caricati dal server.',
      en: 'Results and clips the community has published. Loaded from the server.',
      pt: 'Resultados e clipes publicados pela comunidade. Carregados do servidor.',
   },
   gallery_demo_broke: {
      context: 'lab.html:187',
      it: '0.71 ✓ rotto',
      en: '0.71 ✓ broke',
      pt: '0.71 ✓ quebrou',
   },
   gallery_demo_clip: {
      context: 'lab.html:188',
      it: 'clip 2s',
      en: '2s clip',
      pt: 'clipe 2s',
   },
   info_title: {
      context: 'lab.html:190; lab.html:225',
      it: 'Info',
      en: 'Info',
      pt: 'Info',
   },
   info_description: {
      context: 'lab.html:197',
      it: 'Un laboratorio in tempo reale per testare il camouflage contro il riconoscimento facciale. Cambia l\'aspetto del tuo volto, osserva come reagisce una pipeline locale di riconoscimento, e conserva ciò che funziona.',
      en: 'A real-time lab for testing face-recognition camouflage. Change how your face looks, watch a local recognition pipeline react, and keep what works.',
      pt: 'Um laboratório em tempo real para testar camuflagem contra reconhecimento facial. Mude a aparência do seu rosto, veja uma pipeline local de reconhecimento reagir e guarde o que funciona.',
      notes: 'Glossary: face recognition, pipeline.',
   },
   info_not_invisible: {
      context: 'lab.html:198',
      it: 'Non si tratta di diventare invisibili: si tratta di rendere il sistema abbastanza visibile da poterlo testare.',
      en: 'Not about becoming invisible — about making the system visible enough to test.',
      pt: 'Não é sobre ficar invisível: é sobre tornar o sistema visível o suficiente para testar.',
   },
   initiative_note: {
      context: 'lab.html:199',
      it: 'Presentazione internazionale dell\'iniziativa italiana Ghòstati!, nata nel contesto NINA.',
      en: 'International presentation of the Italian initiative Ghòstati!, born in the NINA context.',
      pt: 'Apresentação internacional da iniciativa italiana Ghòstati!, nascida no contexto NINA.',
   },
   main_nav_label: {
      context: 'lab.html:203',
      it: 'Principale',
      en: 'Main',
      pt: 'Principal',
   },
   save_button: {
      context: 'lab.html:207',
      it: 'Salva',
      en: 'Save',
      pt: 'Salvar',
   },
   upload_button: {
      context: 'lab.html:221',
      it: 'Carica',
      en: 'Upload',
      pt: 'Enviar',
   },
   gallery_button: {
      context: 'lab.html:224',
      it: 'Galleria',
      en: 'Gallery',
      pt: 'Galeria',
   },
   makeup_analysis_label: {
      context: 'lab.html:250',
      it: 'Analisi del trucco',
      en: 'Makeup analysis',
      pt: 'Análise da maquiagem',
   },
   copy_report_button: {
      context: 'lab.html:254',
      it: 'Copia report',
      en: 'Copy report',
      pt: 'Copiar relatório',
   },
   not_available_label: {
      context: 'scripts/dom.js:123',
      it: 'N/D',
      en: 'N/A',
      pt: 'N/D',
   },
   off_status: {
      context: 'scripts/dom.js:124',
      it: 'off',
      en: 'off',
      pt: 'off',
   },
   none_status: {
      context: 'lab.html:157',
      it: 'nessuno',
      en: 'none',
      pt: 'nenhum',
   },
   active_style_missing_console: {
      context: 'scripts/dom.js:172',
      it: 'Nessuno stile trovato per l\'effetto attivo {effect}',
      en: 'No style found for active effect {effect}',
      pt: 'Nenhum estilo encontrado para o efeito ativo {effect}',
   },
   mirror_webcam_on_status: {
      context: 'scripts/main.js:42; scripts/camera.js:71',
      it: 'Webcam speculare: ON',
      en: 'Mirror webcam: ON',
      pt: 'Webcam espelhada: ON',
   },
   mirror_webcam_button: {
      context: 'scripts/main.js:42; scripts/camera.js:71',
      it: 'Webcam speculare',
      en: 'Mirror webcam',
      pt: 'Espelhar webcam',
   },
   switching_camera_log: {
      context: 'scripts/main.js:50',
      it: 'Cambio fotocamera... ({mode})',
      en: 'Switching camera... ({mode})',
      pt: 'Trocando câmera... ({mode})',
   },
   camera_switch_error: {
      context: 'scripts/main.js:57',
      it: 'Errore nel cambio fotocamera.',
      en: 'Error while switching camera.',
      pt: 'Erro ao trocar a câmera.',
   },
   loading_models_status: {
      context: 'scripts/main.js:142',
      it: 'caricamento modelli',
      en: 'loading models',
      pt: 'carregando modelos',
   },
   error_status: {
      context: 'scripts/main.js:164',
      it: 'errore',
      en: 'error',
      pt: 'erro',
   },
   loading_error_log: {
      context: 'scripts/main.js:560',
      it: 'Errore durante il caricamento: {message}',
      en: 'Error while loading: {message}',
      pt: 'Erro ao carregar: {message}',
   },
   save_face_error: {
      context: 'scripts/main.js:522',
      it: 'Errore durante il salvataggio del volto.',
      en: 'Error while saving the face.',
      pt: 'Erro ao salvar o rosto.',
   },
   makeup_analysis_error: {
      context: 'scripts/main.js:534',
      it: 'Errore durante l\'analisi del trucco.',
      en: 'Error while analyzing the makeup.',
      pt: 'Erro ao analisar a maquiagem.',
   },
   error_console_prefix: {
      context: 'scripts/main.js:162',
      it: 'Errore:',
      en: 'Error:',
      pt: 'Erro:',
   },
   face_thumbnail_alt: {
      context: 'scripts/main.js:296',
      it: 'Miniatura volto ID {id}',
      en: 'Face thumbnail ID {id}',
      pt: 'Miniatura do rosto ID {id}',
   },
   no_preview: {
      context: 'scripts/main.js:302; scripts/analyze-panel.js:138',
      it: 'nessuna anteprima',
      en: 'no preview',
      pt: 'sem prévia',
   },
   delete_id_label: {
      context: 'scripts/main.js:334; scripts/main.js:346; scripts/main.js:350',
      it: 'Cancella ID {id}',
      en: 'Delete ID {id}',
      pt: 'Excluir ID {id}',
   },
   confirm_delete_id_label: {
      context: 'scripts/main.js:355; scripts/main.js:356',
      it: 'Conferma cancellazione ID {id}',
      en: 'Confirm deletion of ID {id}',
      pt: 'Confirmar exclusão do ID {id}',
   },
   no_saved_faces_empty: {
      context: 'scripts/main.js:381',
      it: 'Nessun volto salvato.',
      en: 'No saved faces.',
      pt: 'Nenhum rosto salvo.',
   },
   confirm_question: {
      context: 'scripts/main.js:542; scripts/main.js:546; scripts/main.js:548',
      it: 'Conferma?',
      en: 'Confirm?',
      pt: 'Confirmar?',
   },
   loading_face_system_log: {
      context: 'scripts/main.js:556',
      it: 'Caricamento sistema di riconoscimento facciale (face-api.js)...',
      en: 'Loading face-recognition system (face-api.js)...',
      pt: 'Carregando sistema de reconhecimento facial (face-api.js)...',
      notes: 'Glossary: face-api.js, face recognition.',
   },
   loading_embedder_log: {
      context: 'scripts/main.js:564',
      it: 'Caricamento ImageEmbedder per il motore di riconoscimento 3D...',
      en: 'Loading ImageEmbedder for the 3D recognition engine...',
      pt: 'Carregando ImageEmbedder para o motor de reconhecimento 3D...',
      notes: 'Glossary: ImageEmbedder, 3D recognition engine.',
   },
   plugin_reload_started_log: {
      context: 'scripts/main.js:429',
      it: 'Ricarica plugin in corso...',
      en: 'Reloading plugins...',
      pt: 'Recarregando plugins...',
   },
   plugin_reload_done_log: {
      context: 'scripts/main.js:434',
      it: 'Reload completato: {count} plugin caricati.',
      en: 'Reload complete: {count} plugins loaded.',
      pt: 'Recarga concluída: {count} plugins carregados.',
   },
   plugin_reload_error_log: {
      context: 'scripts/main.js:436',
      it: 'Errore durante reload plugins: {message}',
      en: 'Error while reloading plugins: {message}',
      pt: 'Erro ao recarregar plugins: {message}',
   },
   thumbnail_capture_failed_log: {
      context: 'scripts/main.js:485',
      it: 'Acquisizione miniatura fallita: {message}',
      en: 'Thumbnail capture failed: {message}',
      pt: 'Falha ao capturar miniatura: {message}',
   },
   embedder_unavailable_log: {
      context: 'scripts/main.js:568',
      it: 'ImageEmbedder non disponibile: {message} — solo face-api attivo.',
      en: 'ImageEmbedder unavailable: {message} — only face-api is active.',
      pt: 'ImageEmbedder indisponível: {message} — só o face-api está ativo.',
      notes: 'Glossary: ImageEmbedder, face-api.',
   },
   loading_makeup_plugins_log: {
      context: 'scripts/main.js:571',
      it: 'Caricamento plugin di makeup in corso...',
      en: 'Loading makeup plugins...',
      pt: 'Carregando plugins de maquiagem...',
   },
   ghostyles_json_error_log: {
      context: 'scripts/main.js:593',
      it: 'Errore durante la lettura di ghostyles.json: {message}',
      en: 'Error while reading ghostyles.json: {message}',
      pt: 'Erro ao ler ghostyles.json: {message}',
   },
   init_complete_webcam_log: {
      context: 'scripts/main.js:596',
      it: 'Inizializzazione completata. Avvio webcam in corso...',
      en: 'Initialization complete. Starting webcam...',
      pt: 'Inicialização concluída. Iniciando webcam...',
   },
   webcam_permission_error: {
      context: 'scripts/main.js:600',
      it: 'Impossibile inizializzare webcam: verifica i permessi camera per {origin}',
      en: 'Could not start webcam: check camera permissions for {origin}',
      pt: 'Não foi possível iniciar a webcam: verifique as permissões da câmera para {origin}',
   },
   ready_start_log: {
      context: 'scripts/main.js:621',
      it: 'Tutto pronto! Inizia scansionando il tuo volto o attivando una guida makeup.',
      en: 'All set! Start by scanning your face or turning on a makeup guide.',
      pt: 'Tudo pronto! Comece escaneando seu rosto ou ativando uma guia de maquiagem.',
   },
   face_api_models_not_loaded_log: {
      context: 'scripts/engine.js:27',
      it: '[ERROR] face-api modelli non caricati. Riprova tra pochi secondi.',
      en: '[ERROR] face-api models not loaded. Try again in a few seconds.',
      pt: '[ERROR] modelos face-api não carregados. Tente de novo em alguns segundos.',
      notes: 'Glossary: face-api.',
   },
   no_face_webcam_log: {
      context: 'scripts/engine.js:38',
      it: 'Nessun volto rilevato nella webcam.',
      en: 'No face detected in the webcam.',
      pt: 'Nenhum rosto detectado na webcam.',
   },
   face_api_error_log: {
      context: 'scripts/engine.js:47',
      it: '[ERRORE face-api] {message}',
      en: '[face-api ERROR] {message}',
      pt: '[ERRO face-api] {message}',
      notes: 'Glossary: face-api.',
   },
   face_saved_log: {
      context: 'scripts/engine.js:330',
      it: 'Impronta biometrica salvata con ID {id}. Detection score: {score}.',
      en: 'Biometric faceprint saved with ID {id}. Detection score: {score}.',
      pt: 'Impressão biométrica salva com ID {id}. Pontuação da detecção: {score}.',
      notes: 'Glossary: biometric faceprint, detection score.',
   },
   match_2d_ghostyle_unclear_headline: {
      context: 'scripts/landmark-analysis.js:134',
      it: 'Il rilevatore con il Ghostyle vede il volto con ID {id} - diversita {diversity}%.',
      en: 'With the Ghostyle, the detector sees the face as ID {id} - diversity {diversity}%.',
      pt: 'Com o Ghostyle, o detector vê o rosto como ID {id} - diversidade {diversity}%.',
      notes: 'Glossary: Ghostyle, detector, diversity.',
   },
   match_2d_detector_failed_headline: {
      context: 'scripts/landmark-analysis.js:142',
      it: 'Rilevatore ingannato dal Ghostyle! face-api non trova un volto nel disegno composito.',
      en: 'Detector fooled by the Ghostyle! face-api does not find a face in the composite drawing.',
      pt: 'Detector enganado pelo Ghostyle! face-api não encontra um rosto no desenho composto.',
      notes: 'Glossary: detector, Ghostyle, face-api, composite.',
   },
   match_2d_weak_detection_headline: {
      context: 'scripts/landmark-analysis.js:150',
      it: 'Individuazione sul Ghostyle con bassa confidenza (face-api non vede chiaramente un volto).',
      en: 'Low-confidence detection on the Ghostyle (face-api does not clearly see a face).',
      pt: 'Detecção com baixa confiança no Ghostyle (face-api não vê claramente um rosto).',
      notes: 'Glossary: detection confidence, Ghostyle, face-api.',
   },
   match_2d_ghostyle_eluded_headline: {
      context: 'scripts/landmark-analysis.js:159',
      it: 'Ghostyle attivo: volto rilevato ma diversita {diversity}% sopra soglia {threshold}%.',
      en: 'Ghostyle active: face detected, but diversity {diversity}% is above threshold {threshold}%.',
      pt: 'Ghostyle ativo: rosto detectado, mas diversidade {diversity}% acima do limite {threshold}%.',
      notes: 'Glossary: Ghostyle, diversity, threshold.',
   },
   match_2d_live_matched_headline: {
      context: 'scripts/landmark-analysis.js:169',
      it: 'Corrispondenza trovata: ID {id} (diversita {diversity}% sotto soglia {threshold}%).',
      en: 'Match found: ID {id} (diversity {diversity}% below threshold {threshold}%).',
      pt: 'Correspondência encontrada: ID {id} (diversidade {diversity}% abaixo do limite {threshold}%).',
      notes: 'Glossary: match, diversity, threshold.',
   },
   match_2d_live_eluded_headline: {
      context: 'scripts/landmark-analysis.js:178',
      it: 'Nessuna corrispondenza: diversita {diversity}% sopra soglia {threshold}%.',
      en: 'No match: diversity {diversity}% above threshold {threshold}%.',
      pt: 'Sem correspondência: diversidade {diversity}% acima do limite {threshold}%.',
      notes: 'Glossary: match, diversity, threshold.',
   },
   webcam_unavailable_log: {
      context: 'scripts/camera.js:51',
      it: 'Webcam non disponibile in questo contesto.{hint}',
      en: 'Webcam unavailable in this context.{hint}',
      pt: 'Webcam indisponível neste contexto.{hint}',
   },
   webcam_https_hint: {
      context: 'scripts/camera.js:50',
      it: ' La pagina deve essere servita via HTTPS o da localhost (su mobile l\'IP locale non basta).',
      en: ' The page must be served over HTTPS or from localhost (on mobile, a local IP is not enough).',
      pt: ' A página deve ser servida por HTTPS ou por localhost (no celular, um IP local não basta).',
   },
   webcam_live_status: {
      context: 'scripts/camera.js:79',
      it: 'webcam attiva',
      en: 'webcam active',
      pt: 'webcam ativa',
   },
   webcam_active_log: {
      context: 'scripts/camera.js:80',
      it: 'Webcam attiva. Premi l\'icona bersaglio per la scansione o scegli un effetto.',
      en: 'Webcam active. Press the target icon to scan or choose an effect.',
      pt: 'Webcam ativa. Pressione o ícone de alvo para escanear ou escolha um efeito.',
   },
   webcam_stream_inactive_log: {
      context: 'scripts/camera.js:188',
      it: 'Errore: Webcam stream non attivo.',
      en: 'Error: webcam stream is not active.',
      pt: 'Erro: o stream da webcam não está ativo.',
   },
   recording_started_log: {
      context: 'scripts/camera.js:198',
      it: 'Registrazione avviata...',
      en: 'Recording started...',
      pt: 'Gravação iniciada...',
   },
   video_uploading_log: {
      context: 'scripts/camera.js:233',
      it: 'Caricamento del video sul server in corso...',
      en: 'Uploading video to the server...',
      pt: 'Enviando vídeo para o servidor...',
   },
   video_upload_done_log: {
      context: 'scripts/camera.js:245',
      it: 'Caricamento completato con successo sul server (HTTP {status}) - File: {filename}',
      en: 'Upload completed successfully on the server (HTTP {status}) - File: {filename}',
      pt: 'Envio concluído com sucesso no servidor (HTTP {status}) - Arquivo: {filename}',
   },
   video_upload_http_error_log: {
      context: 'scripts/camera.js:247',
      it: 'Errore durante il caricamento del video: Server HTTP {status} {statusText}',
      en: 'Error while uploading video: server HTTP {status} {statusText}',
      pt: 'Erro ao enviar vídeo: servidor HTTP {status} {statusText}',
   },
   video_upload_network_error_log: {
      context: 'scripts/camera.js:250',
      it: 'Errore di rete durante il caricamento del video: {message}',
      en: 'Network error while uploading video: {message}',
      pt: 'Erro de rede ao enviar vídeo: {message}',
   },
   recording_downloaded_log: {
      context: 'scripts/camera.js:265',
      it: 'Registrazione completata e scaricata: {filename}',
      en: 'Recording completed and downloaded: {filename}',
      pt: 'Gravação concluída e baixada: {filename}',
   },
   media_recorder_error_log: {
      context: 'scripts/camera.js:288',
      it: 'Errore durante l\'inizializzazione di MediaRecorder: {message}',
      en: 'Error while initializing MediaRecorder: {message}',
      pt: 'Erro ao inicializar MediaRecorder: {message}',
   },
   local_archive_cleared_log: {
      context: 'scripts/db.js:193',
      it: 'Archivio locale cancellato. Il contatore ID riparte da 0.',
      en: 'Local archive cleared. The ID counter restarts from 0.',
      pt: 'Arquivo local apagado. O contador de ID recomeça em 0.',
   },
   incompatible_3d_db_log: {
      context: 'scripts/db.js:71',
      it: 'Database 3D incompatibile col nuovo modello, svuoto',
      en: '3D database incompatible with the new model, clearing it',
      pt: 'Banco de dados 3D incompatível com o novo modelo, apagando',
      notes: 'Glossary: 3D database.',
   },
   image_embedder_ready_log: {
      context: 'scripts/engine-3d.js:63',
      it: '[3D] ImageEmbedder pronto.',
      en: '[3D] ImageEmbedder ready.',
      pt: '[3D] ImageEmbedder pronto.',
      notes: 'Glossary: ImageEmbedder.',
   },
   image_embedder_not_loaded_error: {
      context: 'scripts/engine-3d.js:105',
      it: '[engine-3d] ImageEmbedder non caricato.',
      en: '[engine-3d] ImageEmbedder not loaded.',
      pt: '[engine-3d] ImageEmbedder não carregado.',
      notes: 'Glossary: ImageEmbedder.',
   },
   no_embedding_returned_error: {
      context: 'scripts/engine-3d.js:110',
      it: 'Nessun embedding restituito dal modello.',
      en: 'No embedding returned by the model.',
      pt: 'Nenhum embedding retornado pelo modelo.',
      notes: 'Glossary: embedding.',
   },
   embedding_extraction_error: {
      context: 'scripts/engine-3d.js:115',
      it: 'Errore estrazione embedding: {message}',
      en: 'Embedding extraction error: {message}',
      pt: 'Erro ao extrair embedding: {message}',
      notes: 'Glossary: embedding.',
   },
   image_embedder_not_ready_save_log: {
      context: 'scripts/engine-3d.js:152',
      it: '[3D] ImageEmbedder non pronto — embedding 3D non salvato.',
      en: '[3D] ImageEmbedder not ready — 3D embedding not saved.',
      pt: '[3D] ImageEmbedder não está pronto — embedding 3D não salvo.',
      notes: 'Glossary: ImageEmbedder, embedding.',
   },
   db_3d_not_initialized_log: {
      context: 'scripts/engine-3d.js:156',
      it: '[3D] DB 3D non inizializzato.',
      en: '[3D] 3D DB not initialized.',
      pt: '[3D] DB 3D não inicializado.',
      notes: 'Glossary: 3D DB.',
   },
   embedding_extraction_log: {
      context: 'scripts/engine-3d.js:163',
      it: '[3D] Errore estrazione embedding: {message}',
      en: '[3D] Embedding extraction error: {message}',
      pt: '[3D] Erro ao extrair embedding: {message}',
      notes: 'Glossary: embedding.',
   },
   image_embedder_saved_log: {
      context: 'scripts/engine-3d.js:172',
      it: '[3D] Embedding ImageEmbedder salvato con ID {id}.',
      en: '[3D] ImageEmbedder embedding saved with ID {id}.',
      pt: '[3D] Embedding do ImageEmbedder salvo com ID {id}.',
      notes: 'Glossary: ImageEmbedder, embedding.',
   },
   image_embedder_not_ready_compare_log: {
      context: 'scripts/engine-3d.js:267',
      it: '[3D] ImageEmbedder non pronto — confronto 3D saltato.',
      en: '[3D] ImageEmbedder not ready — 3D comparison skipped.',
      pt: '[3D] ImageEmbedder não está pronto — comparação 3D ignorada.',
      notes: 'Glossary: ImageEmbedder.',
   },
   live_embedding_extraction_log: {
      context: 'scripts/engine-3d.js:278',
      it: '[3D] Errore estrazione embedding live: {message}',
      en: '[3D] Live embedding extraction error: {message}',
      pt: '[3D] Erro ao extrair embedding ao vivo: {message}',
      notes: 'Glossary: live embedding.',
   },
   match_3d_ghostyle_matched_headline: {
      context: 'scripts/engine-3d.js:316',
      it: '[3D] Ghostyle presente: ImageEmbedder abbina ID {id} (similarità {similarity} ≥ {threshold}).',
      en: '[3D] Ghostyle present: ImageEmbedder matches ID {id} (similarity {similarity} ≥ {threshold}).',
      pt: '[3D] Ghostyle presente: ImageEmbedder corresponde ao ID {id} (similaridade {similarity} ≥ {threshold}).',
      notes: 'Glossary: Ghostyle, ImageEmbedder, similarity.',
   },
   match_3d_ghostyle_eluded_headline: {
      context: 'scripts/engine-3d.js:321',
      it: '[3D] Ghostyle presente: ImageEmbedder non abbina (similarità {similarity} < {threshold}). Embedding visivo spostato.',
      en: '[3D] Ghostyle present: ImageEmbedder does not match (similarity {similarity} < {threshold}). Visual embedding shifted.',
      pt: '[3D] Ghostyle presente: ImageEmbedder não corresponde (similaridade {similarity} < {threshold}). Embedding visual deslocado.',
      notes: 'Glossary: Ghostyle, ImageEmbedder, embedding, similarity.',
   },
   match_3d_empty_db_headline: {
      context: 'scripts/engine-3d.js:327',
      it: '[3D] DB 3D vuoto, nessun confronto ImageEmbedder.',
      en: '[3D] 3D DB empty, no ImageEmbedder comparison.',
      pt: '[3D] DB 3D vazio, sem comparação do ImageEmbedder.',
      notes: 'Glossary: 3D DB, ImageEmbedder.',
   },
   match_3d_live_matched_headline: {
      context: 'scripts/engine-3d.js:332',
      it: '[3D] Corrispondenza ImageEmbedder: ID {id} (similarità {similarity} ≥ {threshold}).',
      en: '[3D] ImageEmbedder match: ID {id} (similarity {similarity} ≥ {threshold}).',
      pt: '[3D] Correspondência ImageEmbedder: ID {id} (similaridade {similarity} ≥ {threshold}).',
      notes: 'Glossary: ImageEmbedder, match, similarity.',
   },
   match_3d_live_eluded_headline: {
      context: 'scripts/engine-3d.js:337',
      it: '[3D] Nessuna corrispondenza ImageEmbedder (max similarità {similarity} < {threshold}).',
      en: '[3D] No ImageEmbedder match (max similarity {similarity} < {threshold}).',
      pt: '[3D] Nenhuma correspondência ImageEmbedder (similaridade máxima {similarity} < {threshold}).',
      notes: 'Glossary: ImageEmbedder, match, similarity.',
   },
   record_clip_first_toast: {
      context: 'scripts/lab-ui.js:102',
      it: 'Registra prima una clip',
      en: 'Record a clip first',
      pt: 'Grave um clipe primeiro',
   },
   fullscreen_not_available_toast: {
      context: 'scripts/lab-ui.js:117',
      it: 'Schermo intero non disponibile qui',
      en: 'Fullscreen not available here',
      pt: 'Tela cheia indisponível aqui',
   },
   ghostyle_not_loaded_toast: {
      context: 'scripts/lab-ui.js:204',
      it: 'Ghostyle "{id}" non caricato',
      en: 'Ghostyle "{id}" not loaded',
      pt: 'Ghostyle "{id}" não carregado',
      notes: 'Glossary: Ghostyle.',
   },
   pinned_to_slot_toast: {
      context: 'scripts/lab-ui.js:242',
      it: 'Fissato nello slot {slot} → {name}',
      en: 'Pinned to Slot {slot} → {name}',
      pt: 'Fixado no slot {slot} → {name}',
      notes: 'Glossary: pinned, slot.',
   },
   measuring_status: {
      context: 'scripts/lab-ui.js:302',
      it: 'Misurazione…',
      en: 'Measuring…',
      pt: 'Medindo…',
   },
   no_face_found_status: {
      context: 'scripts/lab-ui.js:343',
      it: 'Volto non trovato',
      en: 'No face found',
      pt: 'Rosto não encontrado',
   },
   no_face_in_frame_status: {
      context: 'scripts/lab-ui.js:356',
      it: 'Nessun volto nel frame',
      en: 'No face in frame',
      pt: 'Nenhum rosto no quadro',
      notes: 'Glossary: frame.',
   },
   escaped_status: {
      context: 'scripts/lab-ui.js:344; scripts/lab-ui.js:364',
      it: 'Escapou',
      en: 'Escaped',
      pt: 'Escapou',
   },
   recognised_status: {
      context: 'scripts/lab-ui.js:345; scripts/lab-ui.js:364',
      it: 'Reconhecido',
      en: 'Recognised',
      pt: 'Reconhecido',
   },
   visual_comparison_title: {
      context: 'scripts/analyze-panel.js:142',
      it: 'Confronto visivo',
      en: 'Visual comparison',
      pt: 'Comparação visual',
   },
   visual_comparison_label: {
      context: 'scripts/analyze-panel.js:143',
      it: 'Confronto visivo base vs attuale',
      en: 'Baseline vs current visual comparison',
      pt: 'Comparação visual da base com o rosto atual',
      notes: 'Glossary: baseline.',
   },
   baseline_thumbnail_alt: {
      context: 'scripts/analyze-panel.js:137',
      it: 'Thumbnail volto base ID {id}',
      en: 'Baseline face thumbnail ID {id}',
      pt: 'Miniatura do rosto base ID {id}',
      notes: 'Glossary: baseline thumbnail.',
   },
   current_thumbnail_alt: {
      context: 'scripts/analyze-panel.js:150',
      it: 'Thumbnail volto attuale',
      en: 'Current face thumbnail',
      pt: 'Miniatura do rosto atual',
   },
   current_you_label: {
      context: 'scripts/analyze-panel.js:151',
      it: 'Tu ora',
      en: 'You now',
      pt: 'Você agora',
   },
   face_detected_title: {
      context: 'scripts/analyze-panel.js:167; scripts/analyze-panel.js:194',
      it: 'Volto rilevato',
      en: 'Face detected',
      pt: 'Rosto detectado',
   },
   no_face_snapshot: {
      context: 'scripts/analyze-panel.js:168; scripts/analyze-panel.js:430',
      it: 'Nessun volto rilevato nello snapshot.',
      en: 'No face detected in the snapshot.',
      pt: 'Nenhum rosto detectado no snapshot.',
      notes: 'Glossary: snapshot.',
   },
   recognition_title: {
      context: 'scripts/analyze-panel.js:171; scripts/analyze-panel.js:206',
      it: 'Riconoscimento',
      en: 'Recognition',
      pt: 'Reconhecimento',
   },
   no_recognition_data: {
      context: 'scripts/analyze-panel.js:172',
      it: 'Nessun dato di riconoscimento disponibile.',
      en: 'No recognition data available.',
      pt: 'Nenhum dado de reconhecimento disponível.',
   },
   no_id_found: {
      context: 'scripts/analyze-panel.js:180',
      it: 'Nessun ID trovato',
      en: 'No ID found',
      pt: 'Nenhum ID encontrado',
   },
   estimated_age_label: {
      context: 'scripts/analyze-panel.js:195',
      it: 'Eta stimata:',
      en: 'Estimated age:',
      pt: 'Idade estimada:',
   },
   predicted_gender_label: {
      context: 'scripts/analyze-panel.js:197',
      it: 'Genere predetto:',
      en: 'Predicted gender:',
      pt: 'Gênero previsto:',
   },
   dominant_emotion_label: {
      context: 'scripts/analyze-panel.js:199',
      it: 'Emozione dominante:',
      en: 'Dominant emotion:',
      pt: 'Emoção dominante:',
   },
   detection_confidence_label: {
      context: 'scripts/analyze-panel.js:201; scripts/analyze-panel.js:422',
      it: 'Confidence detection:',
      en: 'Detection confidence:',
      pt: 'Confiança da detecção:',
      notes: 'Glossary: detection confidence.',
   },
   state_label: {
      context: 'scripts/analyze-panel.js:207',
      it: 'Stato:',
      en: 'Status:',
      pt: 'Estado:',
   },
   match_with_id_label: {
      context: 'scripts/analyze-panel.js:208; scripts/analyze-panel.js:434',
      it: 'Match con ID:',
      en: 'Match with ID:',
      pt: 'Correspondência com ID:',
      notes: 'Glossary: match.',
   },
   diversity_from_baseline_label: {
      context: 'scripts/analyze-panel.js:209; scripts/analyze-panel.js:436',
      it: 'Diversita dal volto base:',
      en: 'Diversity from baseline face:',
      pt: 'Diversidade em relação ao rosto base:',
      notes: 'Glossary: diversity, baseline.',
   },
   recognition_threshold_label: {
      context: 'scripts/analyze-panel.js:211; scripts/analyze-panel.js:438',
      it: 'Soglia di riconoscimento:',
      en: 'Recognition threshold:',
      pt: 'Limite de reconhecimento:',
      notes: 'Glossary: recognition threshold.',
   },
   interpretation_label: {
      context: 'scripts/analyze-panel.js:213',
      it: 'Interpretazione:',
      en: 'Interpretation:',
      pt: 'Interpretação:',
   },
   analysis_interpretation: {
      context: 'scripts/analyze-panel.js:213',
      it: 'il tuo volto attuale e {diversity} diverso dal volto base {id}; sopra {threshold}% di diversita il sistema non ti riconosce.',
      en: 'your current face is {diversity} different from the baseline face {id}; above {threshold}% diversity, the system does not recognise you.',
      pt: 'seu rosto atual está {diversity} diferente do rosto base {id}; acima de {threshold}% de diversidade, o sistema não reconhece você.',
      notes: 'Glossary: baseline, diversity.',
   },
   analysis_explainer_age: {
      context: 'scripts/analyze-panel.js:17',
      it: 'Eta stimata dal modello - e solo una statistica, puo sbagliare di 5-10 anni.',
      en: 'Age estimated by the model - it is only a statistic and can be wrong by 5-10 years.',
      pt: 'Idade estimada pelo modelo - é apenas uma estatística e pode errar por 5-10 anos.',
   },
   analysis_explainer_gender: {
      context: 'scripts/analyze-panel.js:18',
      it: 'Genere predetto dal modello - addestrato su dataset con bias noti.',
      en: 'Gender predicted by the model - trained on datasets with known bias.',
      pt: 'Gênero previsto pelo modelo - treinado em conjuntos de dados com vieses conhecidos.',
      notes: 'Glossary: dataset bias.',
   },
   analysis_explainer_emotion: {
      context: 'scripts/analyze-panel.js:19',
      it: 'Emozione dominante tra quelle che il modello distingue: happy, sad, angry, fearful, disgusted, surprised, neutral.',
      en: 'Dominant emotion among the ones the model can distinguish: happy, sad, angry, fearful, disgusted, surprised, neutral.',
      pt: 'Emoção dominante entre as que o modelo distingue: happy, sad, angry, fearful, disgusted, surprised, neutral.',
   },
   analysis_explainer_confidence: {
      context: 'scripts/analyze-panel.js:20',
      it: 'Quanto il rilevatore e sicuro di vedere un volto nello snapshot. Sotto 50% spesso non viene rilevato nulla.',
      en: 'How sure the detector is that it sees a face in the snapshot. Below 50%, often nothing is detected.',
      pt: 'Quão seguro o detector está de ver um rosto no snapshot. Abaixo de 50%, muitas vezes nada é detectado.',
      notes: 'Glossary: detector confidence, snapshot.',
   },
   analysis_explainer_distance: {
      context: 'scripts/analyze-panel.js:21',
      it: 'Quanto il tuo volto attuale e diverso dal volto base salvato con questo ID. Piu la percentuale e alta, meno il sistema riesce a riconoscerti.',
      en: 'How different your current face is from the baseline face saved with this ID. The higher the percentage, the less the system can recognise you.',
      pt: 'Quão diferente seu rosto atual está do rosto base salvo com este ID. Quanto maior a porcentagem, menos o sistema consegue reconhecer você.',
      notes: 'Glossary: baseline face.',
   },
   analysis_explainer_threshold: {
      context: 'scripts/analyze-panel.js:22',
      it: 'Sopra questa percentuale di diversita il sistema non ti riconosce piu. Sotto, si.',
      en: 'Above this diversity percentage, the system no longer recognises you. Below it, it does.',
      pt: 'Acima desta porcentagem de diversidade, o sistema não reconhece mais você. Abaixo dela, reconhece.',
      notes: 'Glossary: diversity threshold.',
   },
   analysis_explainer_embedder: {
      context: 'scripts/analyze-panel.js:23',
      it: 'Il motore 3D usa una scala diversa (cosine similarity, 0-1, piu alto = piu simile).',
      en: 'The 3D engine uses a different scale (cosine similarity, 0-1, higher = more similar).',
      pt: 'O motor 3D usa uma escala diferente (similaridade de cosseno, 0-1, maior = mais parecido).',
      notes: 'Glossary: cosine similarity.',
   },
   analyze_error_log: {
      context: 'scripts/analyze-panel.js:269',
      it: '[ERRORE analyze] {message}',
      en: '[analyze ERROR] {message}',
      pt: '[ERRO analyze] {message}',
   },
   report_copied_log: {
      context: 'scripts/analyze-panel.js:230',
      it: 'Report copiato negli appunti',
      en: 'Report copied to clipboard',
      pt: 'Relatório copiado para a área de transferência',
   },
   report_copy_failed_log: {
      context: 'scripts/analyze-panel.js:232',
      it: 'Impossibile copiare il report negli appunti',
      en: 'Could not copy the report to clipboard',
      pt: 'Não foi possível copiar o relatório para a área de transferência',
   },
   report_title_markdown: {
      context: 'scripts/analyze-panel.js:399; scripts/analyze-panel.js:410',
      it: '### Ghostmaxxing - Analisi del trucco',
      en: '### Ghostmaxxing - Makeup analysis',
      pt: '### Ghostmaxxing - Análise da maquiagem',
   },
   yes_value: {
      context: 'scripts/analyze-panel.js:412',
      it: 'si',
      en: 'yes',
      pt: 'sim',
   },
   no_value: {
      context: 'scripts/analyze-panel.js:401; scripts/analyze-panel.js:412',
      it: 'no',
      en: 'no',
      pt: 'não',
   },
   report_face_detected_line: {
      context: 'scripts/analyze-panel.js:401; scripts/analyze-panel.js:412',
      it: 'Volto rilevato: {value}',
      en: 'Face detected: {value}',
      pt: 'Rosto detectado: {value}',
   },
   report_recognition_2d_heading: {
      context: 'scripts/analyze-panel.js:403; scripts/analyze-panel.js:426',
      it: 'Riconoscimento (face-api 2D)',
      en: 'Recognition (face-api 2D)',
      pt: 'Reconhecimento (face-api 2D)',
      notes: 'Glossary: face-api 2D.',
   },
   no_data_available: {
      context: 'scripts/analyze-panel.js:405',
      it: 'Nessun dato disponibile.',
      en: 'No data available.',
      pt: 'Nenhum dado disponível.',
   },
   report_estimated_age_line: {
      context: 'scripts/analyze-panel.js:416',
      it: 'Eta stimata: {value}',
      en: 'Estimated age: {value}',
      pt: 'Idade estimada: {value}',
   },
   report_predicted_gender_line: {
      context: 'scripts/analyze-panel.js:418',
      it: 'Genere predetto: {value}',
      en: 'Predicted gender: {value}',
      pt: 'Gênero previsto: {value}',
   },
   report_dominant_emotion_line: {
      context: 'scripts/analyze-panel.js:420',
      it: 'Emozione dominante: {value}',
      en: 'Dominant emotion: {value}',
      pt: 'Emoção dominante: {value}',
   },
   report_detection_confidence_line: {
      context: 'scripts/analyze-panel.js:422',
      it: 'Confidence detection: {value}',
      en: 'Detection confidence: {value}',
      pt: 'Confiança da detecção: {value}',
      notes: 'Glossary: detection confidence.',
   },
   no_baseline_face_database: {
      context: 'scripts/analyze-panel.js:432',
      it: 'Nessun volto base nel database.',
      en: 'No baseline face in the database.',
      pt: 'Nenhum rosto base no banco de dados.',
      notes: 'Glossary: baseline face.',
   },
   report_match_with_id_line: {
      context: 'scripts/analyze-panel.js:434',
      it: 'Match con ID: {value}',
      en: 'Match with ID: {value}',
      pt: 'Correspondência com ID: {value}',
      notes: 'Glossary: match.',
   },
   report_diversity_line: {
      context: 'scripts/analyze-panel.js:436',
      it: 'Diversita dal volto base: {value}',
      en: 'Diversity from baseline face: {value}',
      pt: 'Diversidade em relação ao rosto base: {value}',
      notes: 'Glossary: diversity, baseline.',
   },
   report_recognition_threshold_line: {
      context: 'scripts/analyze-panel.js:438',
      it: 'Soglia di riconoscimento: {value}',
      en: 'Recognition threshold: {value}',
      pt: 'Limite de reconhecimento: {value}',
      notes: 'Glossary: recognition threshold.',
   },
   report_status_line: {
      context: 'scripts/analyze-panel.js:440',
      it: 'Stato: {value}',
      en: 'Status: {value}',
      pt: 'Estado: {value}',
   },
   report_embedder_3d_heading: {
      context: 'scripts/analyze-panel.js:444',
      it: 'Embedder 3D (MediaPipe)',
      en: '3D Embedder (MediaPipe)',
      pt: 'Embedder 3D (MediaPipe)',
      notes: 'Glossary: Embedder, MediaPipe.',
   },
   report_cosine_similarity_line: {
      context: 'scripts/analyze-panel.js:447; scripts/analyze-panel.js:449',
      it: 'Cosine similarity con ID {id}: {value}',
      en: 'Cosine similarity with ID {id}: {value}',
      pt: 'Similaridade de cosseno com ID {id}: {value}',
      notes: 'Glossary: cosine similarity.',
   },
   no_embedding_data_available: {
      context: 'scripts/analyze-panel.js:451',
      it: 'Nessun dato embedding disponibile.',
      en: 'No embedding data available.',
      pt: 'Nenhum dado de embedding disponível.',
      notes: 'Glossary: embedding.',
   },
   image_copied_log: {
      context: 'scripts/export-makeup.js:49',
      it: 'Immagine con referto diagnostico copiata negli appunti!',
      en: 'Image with diagnostic report copied to clipboard!',
      pt: 'Imagem com relatório de diagnóstico copiada para a área de transferência!',
   },
   image_shared_log: {
      context: 'scripts/export-makeup.js:59',
      it: 'Immagine condivisa con successo!',
      en: 'Image shared successfully!',
      pt: 'Imagem compartilhada com sucesso!',
   },
   image_copy_unavailable_log: {
      context: 'scripts/export-makeup.js:62',
      it: 'Impossibile copiare l\'immagine (permessi mancanti o Share API non supportata).',
      en: 'Could not copy the image (missing permissions or Share API not supported).',
      pt: 'Não foi possível copiar a imagem (permissões ausentes ou Share API não suportada).',
      notes: 'Glossary: Share API.',
   },
   image_copy_error_log: {
      context: 'scripts/export-makeup.js:66',
      it: 'Errore durante la copia. Forse manca il permesso nel browser?',
      en: 'Error while copying. Maybe the browser permission is missing?',
      pt: 'Erro ao copiar. Talvez falte a permissão no navegador?',
   },
   plugin_missing_name_log: {
      context: 'scripts/ghostyles-manager.js:101',
      it: 'Plugin {id} senza @name nell\'header, uso fallback {fallback}',
      en: 'Plugin {id} has no @name in the header, using fallback {fallback}',
      pt: 'Plugin {id} sem @name no cabeçalho, usando fallback {fallback}',
      notes: 'Glossary: plugin header.',
   },
   plugin_missing_version_log: {
      context: 'scripts/ghostyles-manager.js:108',
      it: 'Plugin {id} senza @version',
      en: 'Plugin {id} has no @version',
      pt: 'Plugin {id} sem @version',
   },
   plugin_not_renderable_log: {
      context: 'scripts/ghostyles-manager.js:112',
      it: 'Plugin {id} non esporta ne onDraw ne paintUV, ignorato',
      en: 'Plugin {id} exports neither onDraw nor paintUV, ignored',
      pt: 'Plugin {id} não exporta onDraw nem paintUV, ignorado',
      notes: 'Glossary: onDraw, paintUV.',
   },
   plugin_invalid_release_date_log: {
      context: 'scripts/ghostyles-manager.js:117',
      it: 'Plugin {id} ha @release_date non valida ({releaseDate}), ignorata',
      en: 'Plugin {id} has invalid @release_date ({releaseDate}), ignored',
      pt: 'Plugin {id} tem @release_date inválida ({releaseDate}), ignorada',
   },
   ghostyle_loaded_log: {
      context: 'scripts/ghostyles-manager.js:143',
      it: 'Caricato con successo ghostyle {name} da {url}',
      en: 'Successfully loaded ghostyle {name} from {url}',
      pt: 'Ghostyle {name} carregado com sucesso de {url}',
      notes: 'Glossary: ghostyle.',
   },
   plugin_runtime_error_log: {
      context: 'scripts/ghostyles-manager.js:164; scripts/plugins3d-loader.js:58',
      it: 'Plugin {id} ha lanciato: {message} ({hook})',
      en: 'Plugin {id} threw: {message} ({hook})',
      pt: 'Plugin {id} lançou erro: {message} ({hook})',
   },
   ghostyle_already_active_log: {
      context: 'scripts/ghostyles-manager.js:348',
      it: 'Effetto {name} già attivo. Disattivazione in corso...',
      en: 'Effect {name} already active. Deactivating...',
      pt: 'Efeito {name} já ativo. Desativando...',
   },
   ghostyle_switched_log: {
      context: 'scripts/ghostyles-manager.js:367',
      it: 'Effetto {previous} disattivato, abiliato {name}. Sarà applicato al volto nella webcam.',
      en: 'Effect {previous} deactivated, {name} enabled. It will be applied to the face in the webcam.',
      pt: 'Efeito {previous} desativado, {name} ativado. Será aplicado ao rosto na webcam.',
   },
   ghostyle_activated_log: {
      context: 'scripts/ghostyles-manager.js:369',
      it: 'Effetto {name} attivato. Sarà applicato al volto nella webcam.',
      en: 'Effect {name} activated. It will be applied to the face in the webcam.',
      pt: 'Efeito {name} ativado. Será aplicado ao rosto na webcam.',
   },
   updated_meta_label: {
      context: 'scripts/ghostyles-manager.js:258',
      it: 'aggiornato {time}',
      en: 'updated {time}',
      pt: 'atualizado {time}',
   },
   pin_to_slot_title: {
      context: 'scripts/ghostyles-manager.js:279; scripts/ghostyles-manager.js:286',
      it: 'Fissa nello slot {slot}',
      en: 'Pin to Slot {slot}',
      pt: 'Fixar no slot {slot}',
      notes: 'Glossary: pin, slot.',
   },
   pin_ghostyle_to_slot_label: {
      context: 'scripts/ghostyles-manager.js:280; scripts/ghostyles-manager.js:287',
      it: 'Fissa {name} nello slot {slot}',
      en: 'Pin {name} to Slot {slot}',
      pt: 'Fixar {name} no slot {slot}',
      notes: 'Glossary: pin, slot.',
   },
   params_heading: {
      context: 'scripts/plugins3d-loader.js:373',
      it: 'Parametri - {name}',
      en: 'Parameters - {name}',
      pt: 'Parâmetros - {name}',
   },
   capture_thumbnail_video_required_error: {
      context: 'scripts/face-thumbnails.js:154',
      it: 'captureThumbnail: elemento video richiesto.',
      en: 'captureThumbnail: video element is required.',
      pt: 'captureThumbnail: elemento de vídeo obrigatório.',
   },
   capture_thumbnail_invalid_box_error: {
      context: 'scripts/face-thumbnails.js:156',
      it: 'captureThumbnail: riquadro volto non valido.',
      en: 'captureThumbnail: invalid face box.',
      pt: 'captureThumbnail: caixa de rosto inválida.',
   },
   capture_thumbnail_frame_not_ready_error: {
      context: 'scripts/face-thumbnails.js:162',
      it: 'captureThumbnail: frame video non pronto.',
      en: 'captureThumbnail: video frame not ready.',
      pt: 'captureThumbnail: quadro de vídeo não pronto.',
   },
   capture_thumbnail_context_error: {
      context: 'scripts/face-thumbnails.js:181',
      it: 'captureThumbnail: contesto 2d non disponibile.',
      en: 'captureThumbnail: 2d context unavailable.',
      pt: 'captureThumbnail: contexto 2d indisponível.',
   },
   uv_path_required_error: {
      context: 'scripts/ghostyle3d-uv-renderer.js:25',
      it: '[uv-renderer] uvPath obbligatorio',
      en: '[uv-renderer] uvPath is required',
      pt: '[uv-renderer] uvPath obrigatório',
   },
   media_devices_unavailable_error: {
      context: 'scripts/camera.js:53',
      it: 'mediaDevices unavailable (insecure context?)',
      en: 'mediaDevices unavailable (insecure context?)',
      pt: 'mediaDevices unavailable (insecure context?)',
   },
   plugins3d_not_initialized_error: {
      context: 'scripts/plugins3d-loader.js:92',
      it: '[plugins3d] initPlugins3dLoader() non chiamato',
      en: '[plugins3d] initPlugins3dLoader() not called',
      pt: '[plugins3d] initPlugins3dLoader() não chamado',
   },
   plugins3d_missing_dom_error: {
      context: 'scripts/plugins3d-loader.js:537',
      it: '[plugins3d] elementi DOM mancanti',
      en: '[plugins3d] missing DOM elements',
      pt: '[plugins3d] elementos DOM ausentes',
   },
   canvas_2d_context_error: {
      context: 'scripts/export-makeup.js:178',
      it: 'Impossibile creare il contesto canvas 2D.',
      en: 'Could not create 2D canvas context.',
      pt: 'Não foi possível criar o contexto canvas 2D.',
   },
   console_get_face_embedding_error: {
      context: 'scripts/engine-3d.js:115',
      it: '[getFaceEmbedding]',
      en: '[getFaceEmbedding]',
      pt: '[getFaceEmbedding]',
   },
   console_uv_load_error: {
      context: 'scripts/ghostyle3d-uv-renderer.js:58',
      it: '[uv-renderer] errore caricamento UV:',
      en: '[uv-renderer] UV loading error:',
      pt: '[uv-renderer] erro ao carregar UV:',
   },
   uv_map_loaded_log: {
      context: 'scripts/ghostyle3d-uv-renderer.js:55',
      it: 'UV map caricata ({landmarks} landmark, {triangles} triangoli)',
      en: 'UV map loaded ({landmarks} landmarks, {triangles} triangles)',
      pt: 'Mapa UV carregado ({landmarks} landmarks, {triangles} triângulos)',
      notes: 'Glossary: UV map, landmarks, triangles.',
   },
   uv_map_load_error_log: {
      context: 'scripts/ghostyle3d-uv-renderer.js:59',
      it: 'Errore caricamento UV map: {message}',
      en: 'Error loading UV map: {message}',
      pt: 'Erro ao carregar mapa UV: {message}',
      notes: 'Glossary: UV map.',
   },
   console_uv_paint_error: {
      context: 'scripts/ghostyle3d-uv-renderer.js:368',
      it: '[uv-renderer] paintUV errore:',
      en: '[uv-renderer] paintUV error:',
      pt: '[uv-renderer] erro paintUV:',
   },
   console_detection_error: {
      context: 'scripts/engine.js:46',
      it: '[detectFaceInCam]',
      en: '[detectFaceInCam]',
      pt: '[detectFaceInCam]',
   },
   console_resized_detection_missing: {
      context: 'scripts/engine.js:96',
      it: 'resized.detection non disponibile:',
      en: 'resized.detection unavailable:',
      pt: 'resized.detection indisponível:',
   },
   console_composite_detection_error: {
      context: 'scripts/engine.js:121',
      it: '[compositeAndDetect]',
      en: '[compositeAndDetect]',
      pt: '[compositeAndDetect]',
   },
   console_clipboard_fallback: {
      context: 'scripts/export-makeup.js:53',
      it: 'Clipboard write fallito, provo fallback',
      en: 'Clipboard write failed, trying fallback',
      pt: 'Falha ao escrever na área de transferência, tentando alternativa',
   },
   console_share_failed: {
      context: 'scripts/export-makeup.js:62',
      it: 'Share failed',
      en: 'Share failed',
      pt: 'Compartilhamento falhou',
   },
   console_bbox_overlay_missing: {
      context: 'scripts/bbox-overlay.js:121',
      it: '[bbox-overlay] #bboxOverlay o #overlay mancante, init saltato',
      en: '[bbox-overlay] missing #bboxOverlay or #overlay, skipping init',
      pt: '[bbox-overlay] #bboxOverlay ou #overlay ausente, init ignorado',
   },
   overlay_face_detected_label: {
      context: 'scripts/bbox-overlay.js:558',
      it: 'volto rilevato',
      en: 'face detected',
      pt: 'rosto detectado',
   },
   overlay_estimated_age_label: {
      context: 'scripts/bbox-overlay.js:559',
      it: 'eta stimata: {age}',
      en: 'estimated age: {age}',
      pt: 'idade estimada: {age}',
   },
   overlay_estimated_gender_label: {
      context: 'scripts/bbox-overlay.js:560',
      it: 'genere stimato: {gender}',
      en: 'estimated gender: {gender}',
      pt: 'gênero estimado: {gender}',
   },
   console_mediapipe_events_missing: {
      context: 'scripts/mediapipe-loop.js:68',
      it: '[mediapipe-loop] gstmxx.events non trovato, skip init',
      en: '[mediapipe-loop] gstmxx.events not found, skipping init',
      pt: '[mediapipe-loop] gstmxx.events não encontrado, init ignorado',
   },
   console_mediapipe_video_missing: {
      context: 'scripts/mediapipe-loop.js:73',
      it: '[mediapipe-loop] #video non trovato, skip init',
      en: '[mediapipe-loop] #video not found, skipping init',
      pt: '[mediapipe-loop] #video não encontrado, init ignorado',
   },
   console_mediapipe_init_error: {
      context: 'scripts/mediapipe-loop.js:88',
      it: '[mediapipe-loop] errore init:',
      en: '[mediapipe-loop] init error:',
      pt: '[mediapipe-loop] erro de init:',
   },
   mediapipe_load_error_log: {
      context: 'scripts/mediapipe-loop.js:90',
      it: 'Errore caricamento MediaPipe: {message}',
      en: 'Error loading MediaPipe: {message}',
      pt: 'Erro ao carregar MediaPipe: {message}',
      notes: 'Glossary: MediaPipe.',
   },
   mediapipe_ready_log: {
      context: 'scripts/mediapipe-loop.js:99',
      it: 'MediaPipe FaceLandmarker pronto (478 landmark 3D)',
      en: 'MediaPipe FaceLandmarker ready (478 3D landmarks)',
      pt: 'MediaPipe FaceLandmarker pronto (478 landmarks 3D)',
      notes: 'Glossary: MediaPipe FaceLandmarker, 3D landmarks.',
   },
   console_mediapipe_tick_error: {
      context: 'scripts/mediapipe-loop.js:138',
      it: '[mediapipe-loop] errore tick:',
      en: '[mediapipe-loop] tick error:',
      pt: '[mediapipe-loop] erro de tick:',
   },
   console_lab_ui_bus_missing: {
      context: 'scripts/lab-ui.js:380',
      it: '[lab-ui] state.gstmxxEvents non trovato — readout/effect mirroring disabilitati',
      en: '[lab-ui] state.gstmxxEvents not found — readout/effect mirroring disabled',
      pt: '[lab-ui] state.gstmxxEvents não encontrado — readout/espelhamento de efeito desativados',
   },
   console_auto_find_tick_error: {
      context: 'scripts/auto-find-loop.js:116',
      it: '[auto-find-loop] tick error:',
      en: '[auto-find-loop] tick error:',
      pt: '[auto-find-loop] erro de tick:',
   },
   loader_page_title: {
      context: 'loader.html:7',
      it: 'Ghostmaxxing | Loader video',
      en: 'Ghostmaxxing | Video Loader',
      pt: 'Ghostmaxxing | Carregador de vídeo',
   },
   loader_meta_description: {
      context: 'loader.html:8',
      it: 'Strumento interno Ghostmaxxing per testare video MP4 locali di makeup contro i motori facciali 2D e 3D.',
      en: 'Internal Ghostmaxxing tool for testing local MP4 makeup videos against the 2D and 3D face engines.',
      pt: 'Ferramenta interna do Ghostmaxxing para testar vídeos MP4 locais de maquiagem contra os motores faciais 2D e 3D.',
      notes: 'Glossary: MP4, face engines, 2D, 3D.',
   },
   loader_wordmark_label: {
      context: 'loader.html:19',
      it: 'Homepage Ghostmaxxing',
      en: 'Ghostmaxxing homepage',
      pt: 'Página inicial Ghostmaxxing',
   },
   loader_subtitle: {
      context: 'loader.html:24',
      it: 'Loader video interno',
      en: 'Internal video loader',
      pt: 'Carregador interno de vídeo',
   },
   loader_loading_models_status: {
      context: 'loader.html:32',
      it: 'caricamento modelli',
      en: 'loading models',
      pt: 'carregando modelos',
   },
   loader_title: {
      context: 'loader.html:37',
      it: 'Loader di test video makeup',
      en: 'Makeup Video Test Loader',
      pt: 'Carregador de teste de vídeo de maquiagem',
   },
   loader_stage_label: {
      context: 'loader.html:39',
      it: 'Carica e riproduci video',
      en: 'Load and play video',
      pt: 'Carregar e reproduzir vídeo',
   },
   loader_placeholder: {
      context: 'loader.html:41',
      it: 'Seleziona un video MP4 locale per iniziare.',
      en: 'Select a local MP4 video to begin.',
      pt: 'Selecione um vídeo MP4 local para começar.',
      notes: 'Glossary: MP4.',
   },
   loader_load_mp4: {
      context: 'loader.html:50',
      it: 'Carica MP4',
      en: 'Load MP4',
      pt: 'Carregar MP4',
      notes: 'Glossary: MP4.',
   },
   loader_timeline_label: {
      context: 'loader.html:53',
      it: 'Avanzamento video',
      en: 'Video progress',
      pt: 'Progresso do vídeo',
   },
   loader_actions_label: {
      context: 'loader.html:63',
      it: 'Azioni volto',
      en: 'Face actions',
      pt: 'Ações de rosto',
   },
   loader_record_face_button: {
      context: 'loader.html:64; scripts/loader.js:250',
      it: 'Registra volto',
      en: 'Record face',
      pt: 'Gravar rosto',
   },
   loader_seek_face_button: {
      context: 'loader.html:65; scripts/loader.js:303',
      it: 'Cerca volto',
      en: 'Seek face',
      pt: 'Buscar rosto',
   },
   loader_faces_in_memory: {
      context: 'loader.html:67',
      it: 'Volti in memoria',
      en: 'Faces in memory',
      pt: 'Rostos na memória',
   },
   loader_2d_threshold: {
      context: 'loader.html:71',
      it: 'Soglia 2D',
      en: '2D threshold',
      pt: 'Limiar 2D',
      notes: 'Glossary: threshold, 2D.',
   },
   loader_log_label: {
      context: 'loader.html:78',
      it: 'Registro attività pulsanti',
      en: 'Button activity log',
      pt: 'Registro de atividade dos botões',
   },
   loader_activity_log_title: {
      context: 'loader.html:80',
      it: 'Registro attività',
      en: 'Activity log',
      pt: 'Registro de atividade',
   },
   loader_activity_log_description: {
      context: 'loader.html:81',
      it: 'Ogni voce viene catturata al timestamp video esatto in cui è stato premuto il pulsante.',
      en: 'Each entry is captured at the exact video timestamp where the button was pressed.',
      pt: 'Cada entrada é capturada no timestamp exato do vídeo em que o botão foi pressionado.',
      notes: 'Glossary: timestamp.',
   },
   loader_status_action_failed: {
      context: 'scripts/loader.js:222',
      it: 'azione fallita',
      en: 'action failed',
      pt: 'ação falhou',
   },
   loader_status_loading_faceapi: {
      context: 'scripts/loader.js:396',
      it: 'caricamento face-api',
      en: 'loading face-api',
      pt: 'carregando face-api',
      notes: 'Glossary: face-api.',
   },
   loader_status_loading_3d_embedder: {
      context: 'scripts/loader.js:404',
      it: 'caricamento embedder 3D',
      en: 'loading 3D embedder',
      pt: 'carregando embedder 3D',
      notes: 'Glossary: 3D embedder.',
   },
   loader_status_ready: {
      context: 'scripts/loader.js:474',
      it: 'pronto',
      en: 'ready',
      pt: 'pronto',
   },
   loader_status_model_load_failed: {
      context: 'scripts/loader.js:480',
      it: 'caricamento modelli fallito',
      en: 'model load failed',
      pt: 'falha ao carregar modelos',
   },
   loader_log_loaded_local_video: {
      context: 'scripts/loader.js:428',
      it: 'Video locale caricato: {name}',
      en: 'Loaded local video: {name}',
      pt: 'Vídeo local carregado: {name}',
   },
   loader_ready_log: {
      context: 'scripts/loader.js:475',
      it: 'Loader pronto. Seleziona un MP4 e premi Registra volto o Cerca volto.',
      en: 'Loader ready. Select an MP4 and press Record face or Seek face.',
      pt: 'Carregador pronto. Selecione um MP4 e pressione Gravar rosto ou Buscar rosto.',
      notes: 'Glossary: MP4.',
   },
   loader_model_error_log: {
      context: 'scripts/loader.js:481',
      it: 'Errore modelli loader: {message}',
      en: 'Loader model error: {message}',
      pt: 'Erro de modelo do carregador: {message}',
   },
   loader_action_error: {
      context: 'scripts/loader.js:223',
      it: 'errore',
      en: 'error',
      pt: 'erro',
   },
   loader_action_record_face: {
      context: 'scripts/loader.js:231; scripts/loader.js:250',
      it: 'registra volto',
      en: 'record face',
      pt: 'gravar rosto',
   },
   loader_action_seek_face: {
      context: 'scripts/loader.js:286; scripts/loader.js:303',
      it: 'cerca volto',
      en: 'seek face',
      pt: 'buscar rosto',
   },
   loader_chip_pressed: {
      context: 'scripts/loader.js:146',
      it: 'premuto',
      en: 'pressed',
      pt: 'pressionado',
   },
   loader_chip_video: {
      context: 'scripts/loader.js:147',
      it: 'video',
      en: 'video',
      pt: 'vídeo',
   },
   loader_no_face_result: {
      context: 'scripts/loader.js:233; scripts/loader.js:288',
      it: 'nessun volto rilevato',
      en: 'no face detected',
      pt: 'nenhum rosto detectado',
   },
   loader_no_2d_face_message: {
      context: 'scripts/loader.js:234; scripts/loader.js:289',
      it: 'Nessuna rilevazione 2D face-api era disponibile in questo frame.',
      en: 'No 2D face-api detection was available at this frame.',
      pt: 'Nenhuma detecção 2D do face-api estava disponível neste frame.',
      notes: 'Glossary: 2D, face-api, frame.',
   },
   homepage_wordmark_label: {
      context: 'index.html:27',
      it: 'Prototipo homepage Ghostmaxxing',
      en: 'Ghostmaxxing homepage prototype',
      pt: 'Protótipo da página inicial Ghostmaxxing',
   },
   homepage_subtitle: {
      context: 'index.html:32',
      it: 'Un laboratorio pubblico per testare il camouflage contro il riconoscimento facciale',
      en: 'A public lab for testing face-recognition camouflage',
      pt: 'Um laboratório público para testar camuflagem contra reconhecimento facial',
      notes: 'Glossary: face recognition, camouflage.',
   },
   prototype_navigation_label: {
      context: 'index.html:36',
      it: 'Navigazione del prototipo',
      en: 'Prototype navigation',
      pt: 'Navegação do protótipo',
   },
   research_references_link: {
      context: 'index.html:37',
      it: 'Riferimenti di ricerca',
      en: 'Research References',
      pt: 'Referências de pesquisa',
   },
   vision_about_link: {
      context: 'index.html:38',
      it: 'Visione e informazioni',
      en: 'Vision & About',
      pt: 'Visão e informações',
   },
   leak_to_us_link_html: {
      context: 'index.html:39',
      it: 'Come fare <i>leak</i> a noi<span aria-hidden="true">↗</span>',
      en: 'How to <i>leak</i> to us<span aria-hidden="true">↗</span>',
      pt: 'Como fazer <i>leak</i> para nós<span aria-hidden="true">↗</span>',
      notes: 'Glossary: leak.',
   },
   hero_title_html: {
      context: 'index.html:46',
      it: 'Disturba<br>la lettura.',
      en: 'Disrupt<br>the read.',
      pt: 'Interrompa<br>a leitura.',
   },
   homepage_lead: {
      context: 'index.html:47',
      it: 'Ghostmaxxing è una web app in tempo reale per testare il camouflage contro il riconoscimento facciale. Punta la fotocamera, cambia l\'aspetto del tuo volto e osserva come reagisce una pipeline locale di riconoscimento — live. Tutto gira nel tuo browser, quindi i tuoi dati restano con te.',
      en: 'Ghostmaxxing is a real-time web app for testing face-recognition camouflage. Point your camera, change how your face looks, and watch a local recognition pipeline react — live. Everything runs in your browser, so your data stays with you.',
      pt: 'Ghostmaxxing é uma web app em tempo real para testar camuflagem contra reconhecimento facial. Aponte sua câmera, mude a aparência do seu rosto e veja uma pipeline local de reconhecimento reagir — ao vivo. Tudo roda no seu navegador, então seus dados ficam com você.',
      notes: 'Glossary: face recognition, camouflage, pipeline.',
   },
   homepage_small_html: {
      context: 'index.html:50',
      it: 'Pensato per <a href="workshops.html">workshop</a> pratici e auto-esperimenti: verifica di persona quando un look ferma un match, nelle tue condizioni — non è una promessa che funzionerà ovunque.',
      en: 'Built for hands-on <a href="workshops.html">workshops</a> and self-experiments: see for yourself when a look stops a match, under your own conditions — not a promise that it will hold anywhere else.',
      pt: 'Feito para <a href="workshops.html">workshops</a> práticos e autoexperimentos: veja por conta própria quando um visual interrompe uma correspondência, nas suas condições — não é uma promessa de que funcionará em qualquer outro lugar.',
      notes: 'Glossary: workshops, match.',
   },
   open_lab_link_html: {
      context: 'index.html:54',
      it: 'Apri il lab <span aria-hidden="true">↗</span>',
      en: 'Open the lab <span aria-hidden="true">↗</span>',
      pt: 'Abrir o lab <span aria-hidden="true">↗</span>',
   },
   explore_further_label: {
      context: 'index.html:56',
      it: 'Esplora ancora',
      en: 'Explore further',
      pt: 'Explorar mais',
   },
   technical_documentation_link: {
      context: 'index.html:57',
      it: 'Documentazione tecnica',
      en: 'Technical documentation',
      pt: 'Documentação técnica',
      notes: 'Glossary: technical documentation.',
   },
   code_link: {
      context: 'index.html:58',
      it: 'Codice',
      en: 'Code',
      pt: 'Código',
   },
   homepage_hero_alt: {
      context: 'index.html:65',
      it: 'Ritratto diviso tra overlay di riconoscimento facciale e camouflage avversario.',
      en: 'Portrait split between face-recognition overlay and adversarial camouflage.',
      pt: 'Retrato dividido entre overlay de reconhecimento facial e camuflagem adversarial.',
      notes: 'Glossary: face recognition, overlay, adversarial camouflage.',
   },
};

export function normalizeLocale(locale, fallback = DEFAULT_LOCALE) {
   if (!locale) return fallback;
   const short = String(locale).toLowerCase().split('-')[0];
   return supportedLocales.includes(short) ? short : fallback;
}

export function getStoredLocale() {
   try {
      return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
   } catch {
      return DEFAULT_LOCALE;
   }
}

export function getBrowserLocale() {
   if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
   const languages = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
   const match = languages.map((locale) => normalizeLocale(locale, null)).find(Boolean);
   return match || DEFAULT_LOCALE;
}

let currentLocale = (() => {
   if (typeof process !== 'undefined' && process.env && process.env.VITEST) return 'it';
   try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      return stored ? normalizeLocale(stored) : getBrowserLocale();
   } catch {
      return getBrowserLocale();
   }
})();

export function getLocale() {
   return currentLocale;
}

export function setLocale(locale) {
   currentLocale = normalizeLocale(locale);
   try {
      localStorage.setItem(LOCALE_STORAGE_KEY, currentLocale);
   } catch {
      // Ignore storage failures; the active page still updates.
   }
   document.documentElement.lang = currentLocale;
   window.dispatchEvent(new CustomEvent('i18n:localeChanged', { detail: { locale: currentLocale } }));
   return currentLocale;
}

export function formatMessage(message, params = {}) {
   return String(message).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
   ));
}

export function i18n(key, locale = currentLocale, params = {}) {
   const entry = messages[key];
   if (!entry) {
      console.warn(`[i18n] Missing key: ${key}`);
      return key;
   }
   return formatMessage(entry[normalizeLocale(locale)] || entry.en, params);
}

export function t(key, params = {}) {
   return i18n(key, currentLocale, params);
}

export function applyI18n(root = document) {
   root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
   });
   root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
   });
   root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
   });
   root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
   });
   root.querySelectorAll('[data-i18n-alt]').forEach((el) => {
      el.alt = t(el.dataset.i18nAlt);
   });
   root.querySelectorAll('[data-i18n-content]').forEach((el) => {
      el.setAttribute('content', t(el.dataset.i18nContent));
   });
   document.documentElement.lang = currentLocale;
}

export function updateLocaleSelect(select, locale = currentLocale) {
   if (!select) return;
   const normalized = normalizeLocale(locale);
   const flag = localeFlags[normalized] || normalized.toUpperCase();
   select.value = normalized;
   select.dataset.localeFlag = flag;
   select.title = localeNames[normalized] || normalized;
   select.setAttribute('aria-label', `${t('language_label')}: ${select.title}`);
   const control = select.closest('.locale-control');
   if (control) {
      control.dataset.localeFlag = flag;
      const flagEl = control.querySelector('.locale-control__flag');
      if (flagEl) flagEl.textContent = flag;
   }
}

export function setupLocaleSelect(select, onChange = () => {}) {
   if (!select) return;
   select.innerHTML = '';
   select.classList.add('locale-select');
   for (const locale of supportedLocales) {
      const option = document.createElement('option');
      option.value = locale;
      option.textContent = `${localeFlags[locale]} ${localeNames[locale]}`;
      select.appendChild(option);
   }
   updateLocaleSelect(select);
   select.addEventListener('change', () => {
      const locale = setLocale(select.value);
      onChange(getLocale());
      updateLocaleSelect(select, locale);
   });
   window.addEventListener('i18n:localeChanged', (event) => {
      updateLocaleSelect(select, event.detail?.locale || currentLocale);
   });
}

export function initI18n() {
   document.documentElement.lang = currentLocale;
   applyI18n();
}

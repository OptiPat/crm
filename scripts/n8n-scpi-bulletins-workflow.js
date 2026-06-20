import {
  workflow,
  node,
  trigger,
  sticky,
  splitInBatches,
  nextBatch,
  newCredential,
  expr,
} from '@n8n/workflow-sdk';

const SYSTEM_PROMPT =
  "Tu es l'assistant d'un conseiller en gestion de patrimoine (CGP). Tu resumes des bulletins trimestriels SCPI a partir du texte OCR du PDF.\n\nFORMAT (markdown court) :\n1. Titre : nom SCPI + trimestre/periode (lis le bulletin, pas seulement le nom de fichier)\n2. **Chiffres cles** : 4 a 5 puces — collecte nette, capitalisation/valorisation, distribution du trimestre (EUR/part), taux d'occupation financier, endettement\n3. **Ce trimestre** : 2 a 4 phrases inspirees du descriptif editorial en tete du bulletin (1re page). Reprends les faits marquants du trimestre dans un ton informatif et fluide.\n4. **Acquisitions** (uniquement si le bulletin en liste) : 2 a 3 puces maximum. Chaque puce : lieu (pays, ville) + description simple (type d'actif, montant investi si indique). Si le bulletin cite un locataire par son nom, tu peux le mentionner. Ne pas indiquer les surfaces (m²).\n\nINTERDIT dans le resume :\n- pipeline, collecte a investir, dossiers en cours\n- gouvernance, conseil de surveillance, renouvellement d'equipes\n- conseil en investissement ou incitation a souscrire\n- surfaces en m² dans la section Acquisitions\n\nREGLES :\n- Informatif uniquement\n- Pas de promesse de rendement\n- Chiffres : reprendre tels quels depuis le bulletin\n- Info absente → non communique\n- Ton professionnel et accessible\n- Reponds UNIQUEMENT en markdown francais (sans bloc ```markdown)";

const startTrigger = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Lancer resume bulletins', position: [240, 300] },
  output: [{}],
});

const readBulletins = node({
  type: 'n8n-nodes-base.readWriteFile',
  version: 1.1,
  config: {
    name: 'Lire PDF a-traiter',
    position: [480, 300],
    parameters: {
      operation: 'read',
      fileSelector: '/home/node/.n8n-files/scpi/a-traiter/*.pdf',
      options: { dataPropertyName: 'data' },
    },
  },
  output: [{ fileName: 'Corum_Origin_T1_2026.pdf' }],
});

const batchLoop = splitInBatches({
  version: 3,
  config: {
    name: 'Un bulletin a la fois',
    position: [720, 300],
    parameters: { batchSize: 1 },
  },
});

const extractPdf = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: {
    name: 'Extraire texte PDF',
    position: [960, 420],
    parameters: {
      operation: 'pdf',
      binaryPropertyName: 'data',
      options: { joinPages: true, maxPages: 0 },
    },
  },
  output: [{ text: 'Bulletin trimestriel SCPI...', fileName: 'Corum_Origin_T1_2026.pdf' }],
});

const prepareItem = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparer bulletin',
    position: [1200, 420],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const items = $input.all();
return items.map((item) => {
  const fileName = item.binary?.data?.fileName || 'bulletin.pdf';
  const base = fileName.replace(/\\.pdf$/i, '');
  const rawText = item.json.text || item.json.data || '';
  const bulletinText = String(rawText).slice(0, 18000);
  const scpiName = base
    .replace(/[_-]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
  const sourcePath = '/home/node/.n8n-files/scpi/a-traiter/' + fileName;
  const archivePath = '/home/node/.n8n-files/scpi/traites/' + fileName;
  const summaryPath = '/home/node/.n8n-files/scpi/resumes/' + base + '.md';
  return {
    json: {
      fileName,
      scpiName,
      bulletinText,
      sourcePath,
      archivePath,
      summaryPath,
    },
  };
});`,
    },
  },
  output: [
    {
      fileName: 'Corum_Origin_T1_2026.pdf',
      scpiName: 'Corum Origin T1 2026',
      bulletinText: 'Bulletin trimestriel...',
      sourcePath: '/home/node/.n8n-files/scpi/a-traiter/Corum_Origin_T1_2026.pdf',
      archivePath: '/home/node/.n8n-files/scpi/traites/Corum_Origin_T1_2026.pdf',
      summaryPath: '/home/node/.n8n-files/scpi/resumes/Corum_Origin_T1_2026.md',
    },
  ],
});

const buildMistralRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Construire requete Mistral',
    position: [1440, 420],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const items = $input.all();
const system = ${JSON.stringify(SYSTEM_PROMPT)};
return items.map((item) => {
  const j = item.json;
  const user = 'Fichier : ' + j.fileName + '\\nSCPI (indice titre) : ' + j.scpiName + '\\n\\nContenu bulletin :\\n' + j.bulletinText + '\\n\\nRedige le resume markdown pour ce bulletin.';
  return {
    json: {
      ...j,
      mistralBody: {
        model: 'mistral-small-latest',
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
    },
  };
});`,
    },
  },
  output: [
    {
      fileName: 'Corum_Origin_T1_2026.pdf',
      scpiName: 'Corum Origin T1 2026',
      mistralBody: { model: 'mistral-small-latest', messages: [] },
    },
  ],
});

const mistralSummary = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Mistral resume SCPI',
    position: [1680, 420],
    credentials: { httpHeaderAuth: newCredential('Header Auth account') },
    parameters: {
      method: 'POST',
      url: 'https://api.mistral.ai/v1/chat/completions',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('={{ $json.mistralBody }}'),
      options: {
        response: { response: { responseFormat: 'json' } },
      },
    },
  },
  output: [
    {
      choices: [
        {
          message: {
            content:
              '## Corum Origin — T1 2026\n\n- Collecte stable\n- TD trimestriel maintenu\n- Patrimoine diversifie',
          },
        },
      ],
    },
  ],
});

const formatSummary = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Formater resume',
    position: [1920, 420],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const prep = $('Construire requete Mistral').item.json;
const resp = $input.first().json;
const content = resp.choices?.[0]?.message?.content || resp.message?.content || String(resp);
const generatedAt = new Date().toISOString().slice(0, 10);
const md = '# ' + prep.scpiName + '\\n\\n**Fichier source :** ' + prep.fileName + '\\n**Genere le :** ' + generatedAt + '\\n\\n' + content + '\\n\\n---\\n_Résumé informatif — se referer au bulletin officiel. Ce texte ne constitue pas un conseil en investissement._\\n';
return [{
  json: {
    ...prep,
    summaryMarkdown: md,
    summaryEmail: content,
    generatedAt,
  },
}];`,
    },
  },
  output: [
    {
      fileName: 'Corum_Origin_T1_2026.pdf',
      scpiName: 'Corum Origin T1 2026',
      summaryPath: '/home/node/.n8n-files/scpi/resumes/Corum_Origin_T1_2026.md',
      summaryMarkdown: '# Corum Origin T1 2026\\n\\n- point 1',
      summaryEmail: 'Resume...',
    },
  ],
});

const prepareBinary = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparer binaire markdown',
    position: [2160, 420],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const items = $input.all();
return items.map((item) => {
  const j = item.json;
  const base = j.fileName.replace(/\\.pdf$/i, '');
  return {
    json: j,
    binary: {
      data: {
        data: Buffer.from(j.summaryMarkdown, 'utf8').toString('base64'),
        mimeType: 'text/markdown',
        fileName: base + '.md',
      },
    },
  };
});`,
    },
  },
  output: [{ summaryPath: '/home/node/.n8n-files/scpi/resumes/x.md' }],
});

const writeSummary = node({
  type: 'n8n-nodes-base.readWriteFile',
  version: 1.1,
  config: {
    name: 'Ecrire resume MD',
    position: [2280, 420],
    parameters: {
      operation: 'write',
      fileName: expr('{{ $json.summaryPath }}'),
      options: { dataPropertyName: 'data' },
    },
  },
  output: [{ summaryWritten: true }],
});

const finalizeBatch = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Bulletin traite',
    position: [2640, 420],
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          {
            id: 'status',
            name: 'status',
            value: 'done',
            type: 'string',
          },
        ],
      },
    },
  },
  output: [{ status: 'done', fileName: 'Corum_Origin_T1_2026.pdf' }],
});

const doneMessage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Synthese finale',
    executeOnce: true,
    position: [960, 120],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const processed = $('Bulletin traite').all();
return [{
  json: {
    message: processed.length + ' bulletin(s) traite(s). Resumes dans D:\\\\n8n_bridge\\\\scpi\\\\resumes',
    resumeFolderWindows: 'D:\\\\n8n_bridge\\\\scpi\\\\resumes',
    dropFolderWindows: 'D:\\\\n8n_bridge\\\\scpi\\\\a-traiter',
    count: processed.length,
  },
}];`,
    },
  },
  output: [
    {
      message: '1 resume(s) dans D:\\n8n_bridge\\scpi\\resumes',
      resumeFolderWindows: 'D:\\n8n_bridge\\scpi\\resumes',
    },
  ],
});

const note = sticky(
  '## Bulletins SCPI\\n\\n1. Deposez les PDF dans **D:\\\\n8n_bridge\\\\scpi\\\\a-traiter** (10+ OK)\\n2. Cliquez **Lancer resume bulletins**\\n3. Recuperez les .md dans **resumes/**\\n4. Deplacez les PDF traites vers **traites/** (manuel)\\n\\nCopiez le resume dans une campagne CRM (clients avec ce nom_produit).',
  [readBulletins, mistralSummary, writeSummary],
  { color: 5, position: [240, 80], width: 520, height: 260 }
);

export default workflow('scpi-bulletins-resume', 'SCPI — Resume bulletins trimestriels')
  .add(note)
  .add(startTrigger)
  .to(readBulletins)
  .to(
    batchLoop
      .onDone(doneMessage)
      .onEachBatch(
        extractPdf
          .to(prepareItem)
          .to(buildMistralRequest)
          .to(mistralSummary)
          .to(formatSummary)
          .to(prepareBinary)
          .to(writeSummary)
          .to(finalizeBatch)
          .to(nextBatch(batchLoop))
      )
  );

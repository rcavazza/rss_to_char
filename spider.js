const cheerio = require("cheerio");
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();
require('dotenv').config();
let Parser = require('rss-parser');
let parser = new Parser();

const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.APIKEY
});
// Crea una connessione al database SQLite
const db = new sqlite3.Database("./dbuser.sqlite");


const rssUrl = process.env.RSSURL;
// Crea una tabella se non esiste già
db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS news (id INTEGER PRIMARY KEY, title TEXT, link TEXT, description TEXT, pubDate TEXT, summary TEXT, knowledge TEXT)");
});

// Ottieni il termine di ricerca dal primo argomento
const searchQuery = process.argv[2];
const encodedQuery = encodeURIComponent(searchQuery); // Codifica la query

const AXIOS_OPTIONS = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36",
  },
  params: {
    q: encodedQuery,
    tbm: "nws", // tipo di ricerca "nws" per le notizie
    hl: "it", // lingua italiana
    gl: "IT", // paese Italia
  },
};


// Funzione per rimuovere tutti i tag HTML, CSS e JavaScript
const removeHtmlTagsFromBody = (htmlContent) => {
  const $ = cheerio.load(htmlContent);
  
  // Rimuovi i tag <script> e <style>
  $("script").remove();
  $("style").remove();
  
  // Estrai tutto il testo, rimuovendo i tag HTML
  let text = $.text().trim();
  
  // Rimuovi i caratteri speciali (spazi multipli, nuove righe, tabulazioni)
  text = text.replace(/\s+/g, ' ').replace(/[^\x20-\x7E]/g, '');
  
  // Escape dei caratteri speciali
  text = text.replace(/['"()&<>]/g, (char) => {
    switch (char) {
      case "'": return '\\\'';
      case '"': return '\\"';
      case '(': return '\\(';
      case ')': return '\\)';
      case '&': return '\\&';
      case '<': return '\\<';
      case '>': return '\\>';
      default: return char;
    }
  });

  return text; // Restituisci il testo normalizzato ed escappato
};



async function getNewsInfo() {
  try {
    console.log("[1] Inizio il parsing del feed...");
    const feed = await parser.parseURL(
      rssUrl
    );
    console.log("[2] Parsing completato. Numero di articoli trovati:", feed.items.length);

    console.log("[3] Estraggo le informazioni dal feed...");
    const allNewsInfo = feed.items.map((item) => {
      let linkParams = new URLSearchParams(item.link.split('?')[1]);

      return {
        link: linkParams.get('url') || '',
        title: item.title || '',
        snippet: item.contentSnippet || '',
        date: item.isoDate || '',
      };
    });
    console.log("[4] Informazioni estratte per tutti gli articoli.");

    console.log("[5] Salvo gli articoli nel database...");
    await Promise.all(
      allNewsInfo.map((item) => {
        const { title, link, snippet, date } = item;

        return new Promise((resolve, reject) => {
          db.run(
            "INSERT INTO news (title, link, description, pubDate, summary) VALUES (?, ?, ?, ?, ?)",
            [title, link, snippet, date, ""],
            function (err) {
              if (err) {
                console.error("[Errore] Salvataggio fallito:", err.message);
                reject(err);
              } else {
                console.log(`[Successo] Articolo salvato: ${title}`);
                resolve();
              }
            }
          );
        });
      })
    );
    console.log("[6] Tutti gli articoli sono stati salvati nel database.");

    console.log("[7] Recupero gli articoli dal database per la pulizia...");
    const rows = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM news", [], (err, rows) => {
        if (err) {
          console.error("[Errore] Recupero fallito:", err.message);
          reject(err);
        } else {
          console.log(`[8] Recupero completato. Numero di articoli da pulire: ${rows.length}`);
          resolve(rows);
        }
      });
    });

    console.log("[9] Inizio la pulizia e l'aggiornamento delle colonne summary...");
    await Promise.all(
  rows.map((row) => {
    console.log(`[DEBUG] Richiesta per link: ${row.link}`);

    return axios
      .get(row.link, { timeout: 15000 })
      .then(({ data }) => {
        const cleanedText = removeHtmlTagsFromBody(data);
        console.log(`[DEBUG] Testo pulito per ID ${row.id}:`, cleanedText);

        return new Promise((resolve, reject) => {
          db.run(
            "UPDATE news SET summary = ? WHERE id = ?",
            [cleanedText, row.id],
            (err) => {
              if (err) {
                console.error(`[Errore] Query SQL fallita per ID ${row.id}:`, err.message);
                reject(err);
              } else {
                console.log(`[Successo] Summary aggiornato per articolo ID ${row.id}`);
                resolve();
              }
            }
          );
        });
      })
      .catch((error) => {
        console.error("[Errore] Richiesta fallita per il link:", row.link, error.message);
        // Risolvi la promessa per evitare blocchi
        return Promise.resolve();
      });
  })
);

    console.log("[10] Pulizia completata per tutti gli articoli.");

//     console.log("[11] Inizio la generazione dei riassunti per ogni articolo...");
//     (async () => {
//   try {
//     console.log("[DEBUG] Inizio lettura articoli dal database...");
//     const rows = await getNewsRows(); // Esegui la query

//     console.log("[DEBUG] Numero di articoli trovati:", rows.length);

//     // Ora esegui le operazioni su ogni articolo
//     await Promise.all(
//       rows.map((row) => {
//         const summary = row.summary;
//         console.log(`[12] Richiedo un riassunto per l'articolo ID ${row.id}...`);
//         console.log(`[DEBUG] Articolo:`, row);

//         // Codice per invocare OpenAI (commentato per ora)
//         return openai.chat.completions.create({
//           model: "gpt-4o-mini",
//           messages: [
//             {
//               role: "user",
//               content: `Write a summary about this article: '${summary}'`,
//             },
//           ],
//         }).then((completion) => {
//           return new Promise((resolve, reject) => {
//             db.run(
//               "UPDATE news SET knowledge = ? WHERE id = ?",
//               [completion.choices[0].message.content, row.id],
//               (err) => {
//                 if (err) {
//                   console.error(`[Errore] Aggiornamento knowledge fallito per ID ${row.id}:`, err.message);
//                   reject(err);
//                 } else {
//                   console.log(`[Successo] Knowledge aggiornato per articolo ID ${row.id}`);
//                   resolve();
//                 }
//               }
//             );
//           });
//         }).catch((error) => {
//           console.error(`[Errore] Richiesta OpenAI fallita per ID ${row.id}:`, error.message);
//         });
//       })
//     );

//     console.log("[INFO] Operazioni completate per tutti gli articoli.");
//   } catch (error) {
//     console.error("[Errore] Errore generale durante l'elaborazione:", error.message);
//   }
// })();

//     console.log("[13] Riassunti generati per tutti gli articoli.");
    console.log("[Fine] Esecuzione completata con successo!");
  } catch (error) {
    console.error("[Errore Generale] Errore durante l'esecuzione:", error);
  }
}


function getNewsRows() {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM news", [], (err, rows) => {
      if (err) {
        console.error("[Errore] Lettura dal database fallita:", err.message);
        reject(err);
      } else {
        console.log("[INFO] Articoli letti dal database.");
        resolve(rows);
      }
    });
  });
}

getNewsInfo();
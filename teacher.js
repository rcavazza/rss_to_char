const sqlite3 = require('sqlite3').verbose();
require('dotenv').config()
const { OpenAI } = require('openai');  // Assicurati di aver installato e configurato il pacchetto OpenAI
const openai = new OpenAI({
    apiKey: process.env.APIKEY
});
const fs = require('fs').promises; // Usa la versione promise-based di fs
const path = require('path');

// Recupera i percorsi dei file dagli argomenti della riga di comando
const jsonFilePath = process.argv[2];
const textFilePath = process.argv[3];

if (!jsonFilePath) {
    console.error('Errore: specifica il percorso del file JSON e del file di testo come argomenti.');
    console.error('Uso: node script.js <path/to/file.json>');
    process.exit(1);
}


// Crea una connessione al database SQLite
const db = new sqlite3.Database("./dbuser.sqlite");

// Funzione per leggere i dati dal database e inviare a OpenAI
async function processNews() {
    db.all("SELECT * FROM news", async (err, rows) => {
        if (err) {
            console.error('Errore durante la lettura del database:', err);
            return;
        }

        // Cicla attraverso le righe della tabella news
        for (const row of rows) {
            console.log(`\nRiga ${row.id}:`);
            console.log(`Titolo: ${row.title}`);
            console.log(`Link: ${row.link}`);
            console.log(`Descrizione: ${row.description}`);
            console.log(`Data di pubblicazione: ${row.pubDate}`);
            console.log(`Summary: ${row.summary}`);

            // Verifica se la colonna summary contiene del contenuto
            if (row.summary && row.summary.trim() !== "") {
                try {
                    // Invia la richiesta a OpenAI per ottenere un riassunto
                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: "write a resume of the content of this webpage" },
                            {
                                role: "user",
                                content: `create a resume in english from this article: ${row.summary}`,
                            },
                        ],
                    });

                    // Stampa il riassunto
                    const summaryResult = completion.choices[0].message.content;
                    console.log('Riassunto generato:');
                    console.log(summaryResult);

                    // Aggiungi il riassunto generato nella colonna 'knowledge'
                    db.serialize(() => {
                        const updateStmt = db.prepare("UPDATE news SET knowledge = ? WHERE id = ?");
                        updateStmt.run(summaryResult, row.id);
                        updateStmt.finalize();
                    });
                } catch (error) {
                    console.error(`Errore durante la generazione del riassunto per l'articolo con ID ${row.id}:`, error);
                }
            } else {
                console.log('Nessun contenuto disponibile per il riassunto.');
            }
        }

        // Messaggio di completamento
        console.log("\nTutti gli articoli sono stati processati.");
        processJsonFile(jsonFilePath);
    });
}

// Funzione per pulire una riga da caratteri speciali
function cleanLine(line) {
    return line.replace(/[\r\n\t\f\v]/g, '').trim();
}

// Funzione per leggere un file di testo riga per riga e pulire ciascuna riga
async function readTextFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data
            .split('\n') // Dividi in base alle righe
            .map(cleanLine) // Pulisci ciascuna riga
            .filter(line => line !== ''); // Escludi righe vuote
    } catch (error) {
        throw new Error(`Errore durante la lettura del file di testo: ${error.message}`);
    }
}

// Funzione per leggere e aggiornare il file JSON
async function processJsonFile(jsonFilePath) {
    const absoluteJsonPath = path.resolve(jsonFilePath);
    const backupFilePath = `${absoluteJsonPath}.OLD`;

    try {
        // Leggi il file JSON
        const jsonDataRaw = await fs.readFile(absoluteJsonPath, 'utf8');
        // Salva una copia del file originale
        await fs.writeFile(backupFilePath, jsonDataRaw, 'utf8');
        console.log(`Backup salvato come: ${backupFilePath}`);
        const jsonData = JSON.parse(jsonDataRaw);

        jsonData.knowledge = [];

        db.all("SELECT knowledge FROM news", (err, rows) => {
            if (err) {
                console.error('Errore durante la lettura dal database:', err);
                return;
            }

            // Aggiungi i dati dalla colonna 'knowledge' all'array jsonData.knowledge
            rows.forEach((row) => {
                if (row.knowledge && row.knowledge.trim() !== "") {
                    jsonData.knowledge.push(row.knowledge);
                }
            });

            // Visualizza il risultato finale
            console.log("Knowledge caricato da DB:", jsonData.knowledge);
            fs.writeFile(absoluteJsonPath, JSON.stringify(jsonData, null, 2), 'utf8');
            console.log(`File JSON aggiornato salvato come: ${absoluteJsonPath}`);
        });

        // Scrivi il file JSON aggiornato
    } catch (error) {
        console.error('Errore durante l\'elaborazione:', error.message);
    }
}

// Avvio dello script
// processJsonFile(jsonFilePath, textFilePath);

// Inizia il processo
processNews();

# Regole del Progetto e Vincoli di Comportamento

## 1. Confinamento alla Cartella di Lavoro Corrente(o ambiente di lavoro workspace)
- L'assistente deve operare e confinare ogni lettura, scrittura, esecuzione ed ispezione rigorosamente all'interno della cartella di lavoro (working directory) del progetto attivo e delle sue sotto-cartelle (es. sotto-moduli o cartelle interne come `cli/`).
- È vietato uscire dalla cartella di lavoro per accedere, leggere o modificare file personali o percorsi esterni arbitrari del sistema.

## 2. Nessuna Operazione Git Autonoma
- L'assistente non deve mai eseguire in autonomia comandi di `git add`, `git commit` né `git push`.
- Tutte le operazioni di staging, commit e sincronizzazione con i repository remoti spettano esclusivamente all'utente.

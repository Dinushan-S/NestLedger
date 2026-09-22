# Repository agent instructions

- Exclude `node_modules/**` from broad file searches, recursive scans, summaries, indexing, and context collection.
- Respect `.gitignore` during repository exploration unless the task specifically requires an ignored file.
- Inspect `node_modules` only when dependency behavior must be verified. In that case, read only the specific package files needed for the diagnosis; never scan the directory wholesale.

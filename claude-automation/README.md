# Claude Desktop Automation

Automatiserar interaktion med Claude AI desktop app för effektiv batch-processing av noter.

> ⚠️ **Obs**: Detta är ett separat verktyg, inte del av hagen-ui.

## Setup

```bash
cd claude-automation
pip install -r requirements.txt
```

## Batch-processa noter (huvudanvändning)

Perfekt för att processa företagsnoter genom Claude och få tillbaka analyser.

### 1. Förbered din noter-fil

Formatet ska vara:
```markdown
## 1. Företagsnamn
**Email:** example@email.com
**TikTok:** @handle
...

### Noter:
Dina anteckningar här...

## 2. Nästa företag
...
```

Se `example_notes.md` för ett fullständigt exempel.

### 2. Anpassa prompten

Redigera `config.py` för att ändra:
- `SYSTEM_PROMPT` - Instruktionen som skickas före varje not
- `RESPONSE_HEADER` - Rubriken som läggs till före svaret

### 3. Kör batch-processorn

```bash
# Öppna Claude desktop först!

# Processa alla noter
python batch_process_notes.py dina_noter.md

# Starta från not #5 (om du vill fortsätta)
python batch_process_notes.py dina_noter.md --start-from 5

# Testa utan att skicka (dry run)
python batch_process_notes.py dina_noter.md --dry-run
```

### 4. Under körning

- **'c'** - Tryck när Claude är klar med svaret → kopierar och går vidare
- **'s'** - Hoppa över denna not
- **'q'** - Avbryt helt
- **Mus till hörn** - Nödstopp

### 5. Resultat

Scriptet:
1. Skapar backup av originalfilen (`.backup.md`)
2. Lägger till `### LeTrend Analys:` efter varje not med svaret
3. Sparar efter varje not (så du inte förlorar progress)

## Enkel interaktion (basic script)

För enkel prompt → svar:

```bash
# Enkel prompt
python claude_desktop_automation.py -p "Din fråga"

# Från fil
python claude_desktop_automation.py -f prompt.txt -o svar.txt

# Interaktivt läge
python claude_desktop_automation.py -i
```

## Filer

```
claude-automation/
├── batch_process_notes.py    # Huvud batch-processor
├── claude_desktop_automation.py  # Enkel single-prompt
├── config.py                 # Inställningar (redigera denna!)
├── example_notes.md          # Exempelfil
├── requirements.txt
└── README.md
```

## Tips

- Ha Claude-konversationen öppen med rätt kontext innan du kör
- Prompten i `config.py` läggs till före varje not
- Om något går fel, använd `--start-from X` för att fortsätta
- Backup sparas automatiskt första gången

## Begränsningar

- Kräver att Claude desktop är öppet och synligt
- Svardetektering är manuell (tryck 'c')
- Windows-testat, borde funka på Mac/Linux med justeringar

json{
  "gamePlan": {
    "lastUpdated": "2025-01-08",
    "brandHandle": "@mellowcafe",
    "notes": [
      {
        "type": "text",
        "content": "Hej! Här är mina tankar efter att ha gått igenom ert konto."
      },
      {
        "type": "heading",
        "content": "Vad som funkar"
      },
      {
        "type": "text",
        "content": "Ni har en tydlig röst — mysig men med torr humor."
      },
      {
        "type": "link",
        "label": "Ert bästa exempel",
        "url": "https://tiktok.com/@mellowcafe/video/123",
        "linkType": "tiktok"
      },
      {
        "type": "links",
        "links": [
          {
            "label": "@salongwoar",
            "url": "https://tiktok.com/@salongwoar/video/1",
            "linkType": "tiktok"
          },
          {
            "label": "@restaurangansen",
            "url": "https://tiktok.com/@restaurangansen/video/2",
            "linkType": "tiktok"
          },
          {
            "label": "Varför detta funkar",
            "url": "https://example.com/article",
            "linkType": "article"
          }
        ]
      }
    ]
  }
}
```

**Blocktyper:**

| `type` | Fält | Beskrivning |
|--------|------|-------------|
| `text` | `content` | Vanlig paragraf |
| `heading` | `content` | Rubrik (fetstil) |
| `link` | `label`, `url`, `linkType` | Enskild länkknapp |
| `links` | `links[]` | Flera länkar i rad |

**Länktyper (`linkType`):**

| Värde | Ikon |
|-------|------|
| `tiktok` | TikTok |
| `instagram` | Instagram |
| `youtube` | YouTube |
| `article` | Dokument |
| `external` | Extern (default) |

---

**Praktiskt workflow:**

Du kan skriva i ett enkelt format och konvertera till JSON:
```
# Vad som funkar

Ni har en tydlig röst — mysig men med torr humor.

[tiktok: Ert bästa exempel](https://tiktok.com/...)

# Inspiration

[tiktok: @salongwoar](https://...) [tiktok: @restaurangansen](https://...) [article: Läs mer](https://...)
Ett script kan parsa detta till JSON:

#  → heading
Vanlig text → text
[typ: label](url) → link
Flera länkar på samma rad → links
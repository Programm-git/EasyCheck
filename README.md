# JobConnect

Statische Webseite zur Vermittlung zwischen Auftragnehmern und Auftraggebern.

## Lokal ansehen

`index.html` einfach im Browser öffnen, oder mit einem lokalen Server starten:

```bash
npx serve .
```

## Deployment über GitHub Pages

1. Repository auf GitHub erstellen und diesen Ordner pushen.
2. In den Repository-Einstellungen unter **Settings → Pages** als Quelle **GitHub Actions** auswählen.
3. Der Workflow in `.github/workflows/deploy.yml` deployt bei jedem Push auf `main` automatisch.
4. Die Seite ist danach unter `https://<username>.github.io/<repo-name>/` erreichbar.

# Foreign Immigration Services — Website

Official website of Foreign Immigration Services, a Bureau of Immigration
accredited consultancy (Accreditation No. CA-202623557) operating in the
Philippines.

Built with [Eleventy](https://www.11ty.dev/) as a static site, deployed to
GitHub Pages. See `docs/` for planning notes.

## Local development

Requires Node.js (see `.nvmrc` for the version used).

```
npm install
npm start        # local dev server with live reload, http://localhost:8080
npm run build    # production build to _site/
```

## Structure

- `src/` — page content and templates (English content lives at the site
  root; `zh-Hans/` and `ko/` will be added once translations are approved)
- `src/_includes/` — shared layout and header/footer partials
- `src/assets/` — CSS and images (no external font or script dependencies)
- `.github/workflows/deploy.yml` — builds and deploys `main` to GitHub Pages

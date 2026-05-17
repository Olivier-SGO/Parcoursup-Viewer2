# Synchronisation par fichier

## Principe

Parcoursup Viewer n'a pas besoin de backend cloud. La synchronisation entre appareils se fait via un **fichier JSON** que vous placez dans un dossier synchronisé (iCloud Drive, Dropbox, Google Drive, OneDrive, Syncthing…).

## Workflow

### 1. Exporter
Sur l'appareil A, après avoir classé vos vœux :
- Cliquez le bouton **↓ Exporter** dans la barre de synchronisation.
- Un fichier `parcoursup-classement.json` est téléchargé.
- Placez-le dans votre dossier synchronisé (ex: `iCloud Drive/Parcoursup/`).

### 2. Attendre la synchro
Votre service de cloud (iCloud, Dropbox…) synchronise le fichier automatiquement sur l'appareil B.

### 3. Importer
Sur l'appareil B :
- Cliquez le bouton **↑ Importer**.
- Sélectionnez le fichier `parcoursup-classement.json` depuis votre dossier synchronisé.
- Vos vœux, classement, statuts et notes sont restaurés.

## Protection anti-écrasement

Le fichier JSON contient deux champs de sécurité :
- **`version`** — numéro incrémental (1, 2, 3…)
- **`lastModified`** — date de dernière modification

Quand vous importez un fichier, l'app compare sa version avec celle du `localStorage` :
- **Fichier plus récent** → import direct.
- **Fichier plus ancien** → dialog de confirmation :
  > Ce fichier (v3, 12/05/2026 14:30) est plus ancien que votre session locale (v5, 12/05/2026 16:45).  
  > Importer quand même ? Cela écrasera vos modifications locales.

Cela évite l'erreur classique : ouvrir une vieille version sur un autre poste, la modifier, et exporter par-dessus le fichier à jour.

## Astuces

- **Nommez vos fichiers** avec la date : `parcoursup-2026-05-12.json` si vous faites des sauvegardes manuelles.
- **Lien snapshot** (bouton 🔗) reste disponible pour partager une version figée en lecture seule, sans fichier.
- **Supabase** reste réactivable si vous préférez une synchro automatique en arrière-plan. Passez `SUPABASE_ENABLED = true` dans `app.js` et suivez `SUPABASE_SETUP.md`.

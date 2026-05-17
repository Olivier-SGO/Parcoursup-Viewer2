# Setup Supabase (5 minutes)

> **Note** : Supabase est désactivé par défaut depuis mai 2026. Google Drive est maintenant le backend recommandé (voir `GOOGLE_DRIVE_SETUP.md`).
> Pour réactiver Supabase, passez `SUPABASE_ENABLED = true` dans `app.js`.

## 1. Créer un projet
- Va sur [supabase.com](https://supabase.com) → Sign up / Log in
- Clique **"New project"**
- Nom du projet : `parcoursup-viewer`
- Mot de passe de la base : choisis-en un simple (tu ne l'utiliseras presque jamais)
- Region : la plus proche de chez toi (ex: `West Europe`)
- **Create new project** (attends 1-2 minutes que le projet démarre)

## 2. Créer la table
- Dans le menu gauche, clique sur **"Table Editor"**
- Clique **"New table"**
- Name : `rankings`
- Colonnes :
  - `id` → type `text`, coche **Is Primary Key**
  - `data` → type `jsonb`, laisse Default vide
- Décoche **"Enable Row Level Security (RLS)"** (en bas de la modale)
- Clique **"Save"**

> Si tu ne vois pas la case à décocher RLS, après création va dans la table → onglet **"Auth/Policies"** → clique **"Disable RLS"**.

## 3. Récupérer les clés API
- Menu gauche : **Project Settings** (icône engrenage en bas) → **API**
- Copie ces deux valeurs :
  - **Project URL** : `https://xxxxxxxxxxxxxxxx.supabase.co`
  - **anon public** : `eyJhbG...`

## 4. Coller dans l'app
Ouvre `app.js` et remplace les deux constantes en haut de la section sync :

```javascript
const SUPABASE_URL = 'https://xxxxxxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbG...';
```

## 5. Tester
Ouvre `index.html` dans ton navigateur, clique **"☁ Synchro cloud" → "Activer la synchro"**.
Si tout est vert, c'est bon.

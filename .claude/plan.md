# Plan: Complétion Visunyx Portal — 6 Étapes

## Étape 1 — Messaging Temps Réel (Améliorations)
Le messaging fonctionne déjà (envoi, réception, realtime, mark as read). Améliorations :
- **Fix profil sur messages realtime** : quand un message arrive via realtime, il manque les données profil (nom, avatar). Fetch le profil ou utiliser les données locales.
- **Pièces jointes dans messages** : la colonne `attachment_path` existe en DB mais aucune UI. Ajouter upload de fichier dans le chat (client, designer, admin).
- **Indicateur "est en train d'écrire"** : via Supabase Presence.
- **Accusés de lecture visuels** : afficher "Lu" sous les messages lus.
- Fichiers concernés : `client/project.html`, `designer/project.html`, `admin/project.html`, `shared/components.js`, `shared/style-base.css`

## Étape 2 — Galerie Fichiers & Preview
Upload/download fonctionnent. Manque la preview et les thumbnails :
- **Modal preview** : clic sur un fichier image/PDF → modal plein écran avec preview inline.
- **Thumbnails images** : pour les fichiers image (png, jpg, gif, webp, svg), afficher une miniature au lieu d'une simple icône.
- **Infos fichier** : catégorie, uploadé par, date dans la card.
- Fichiers concernés : `shared/components.js` (renderFileCard), `shared/style-base.css`, `client/project.html`, `designer/project.html`, `admin/project.html`

## Étape 3 — Page Projet Designer (Complétion)
La page fonctionne à 70%. Améliorations :
- **Historique des versions** : afficher les fichiers groupés par version/catégorie avec timeline.
- **Actions rapides** : changer statut si autorisé, marquer comme livré.
- **Brief enrichi** : afficher le brief de façon plus structurée (sections, évaluations revision).
- **Compteur de fichiers par catégorie** dans le header.
- Fichier : `designer/project.html`

## Étape 4 — Designer Messages (Page complète)
La page liste les conversations mais manque de polish :
- **Recherche de conversations** : barre de recherche pour filtrer.
- **Badge unread par conversation** : déjà fetch mais vérifier l'affichage.
- **Indicateur dernière activité** : "il y a 2h", "Hier", etc.
- **Empty state** si aucun projet assigné.
- Fichier : `designer/messages.html`

## Étape 5 — Client Revision (Polish)
Fonctionnel à 100% mais polish UI :
- **Animations GSAP** sur les transitions entre steps.
- **Confirmation visuelle** plus riche à la fin (confetti ou animation).
- **Preview du résumé** avant soumission (step 3 → résumé complet).
- Fichier : `client/revision.html`

## Étape 6 — Client Signup (Intégration)
Fonctionnel mais à intégrer proprement :
- **Lien depuis login.html** : bouton "Créer un compte" sur la page login.
- **Redirection post-signup** : vers le bon dashboard.
- **Validation email** : vérification format + feedback visuel.
- **Animation de bienvenue** : page de succès avec animation.
- Fichiers : `client/signup.html`, `login.html`

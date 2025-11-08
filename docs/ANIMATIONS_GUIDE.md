# Guide d'ajout d'animations Mixamo

Ce guide explique comment ajouter des animations Mixamo à votre projet VRM.

## 📥 Télécharger des animations depuis Mixamo

1. **Aller sur Mixamo.com** : https://www.mixamo.com/
   - Connectez-vous avec votre compte Adobe (gratuit)

2. **Choisir un personnage** :
   - Sélectionnez un personnage dans la bibliothèque
   - Ou uploadez votre propre modèle VRM (optionnel)

3. **Parcourir les animations** :
   - Cliquez sur l'onglet "Animations"
   - Recherchez des animations (ex: "idle", "walking", "dancing", "waving")
   - Cliquez sur une animation pour la prévisualiser

4. **Télécharger les animations** :
   - Cliquez sur "Download"
   - **Format important** : Choisissez **"glTF"** ou **"FBX for Unity"**
   - ✅ Cochez "With Skin" si disponible
   - Cliquez sur "Download"

## 📤 Héberger vos animations

Vous devez héberger vos fichiers GLB sur un serveur accessible. Voici plusieurs options :

### Option 1 : GitHub (Recommandé - Gratuit)

1. Créez un dossier `animations` dans votre dépôt GitHub
2. Uploadez vos fichiers `.glb` dans ce dossier
3. Utilisez jsDelivr CDN pour les URLs :
   ```
   https://cdn.jsdelivr.net/gh/VOTRE-USERNAME/VOTRE-REPO@main/animations/nom-animation.glb
   ```

**Exemple** :
```
https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/idle.glb
```

### Option 2 : Votre propre serveur

Si vous avez un serveur web, placez les fichiers dans un dossier accessible et utilisez l'URL complète :
```
https://votre-domaine.com/animations/idle.glb
```

### Option 3 : Cloud Storage

- **Google Drive** : Partagez le fichier et utilisez un service de conversion
- **Dropbox** : Partagez et obtenez le lien direct
- **AWS S3** : Si vous avez un compte AWS

## 🔧 Ajouter les animations au code

1. Ouvrez `docs/script.js`

2. Trouvez la section `animationUrls` (ligne ~319) :

```javascript
const animationUrls = [
    // Ajoutez vos URLs ici
    "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/idle.glb",
    "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/wave.glb",
    "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/dance.glb",
    // ... ajoutez autant d'animations que vous voulez
];
```

3. Ajoutez vos URLs d'animations dans le tableau

## 🎬 Animations recommandées

Voici une liste d'animations populaires à télécharger depuis Mixamo :

- **idle** - Animation de repos
- **walking** - Marche
- **running** - Course
- **jumping** - Saut
- **dancing** - Danse
- **waving** - Salutation
- **pointing** - Pointer du doigt
- **clapping** - Applaudir
- **cheering** - Encourager
- **sitting** - S'asseoir
- **standing** - Debout
- **stretching** - Étirement
- **yawning** - Bâillement

## ⚙️ Fonctionnalités du système

- ✅ **Chargement automatique** : Les animations se chargent au démarrage
- ✅ **Retargeting VRM** : Les animations sont automatiquement adaptées au squelette VRM
- ✅ **Rotation automatique** : Les animations changent automatiquement toutes les 5 secondes
- ✅ **Boucle** : Chaque animation se répète en boucle
- ✅ **Transition fluide** : Transitions douces entre les animations
- ✅ **Gestion d'erreurs** : Le système continue même si certaines animations échouent

## 🐛 Dépannage

### Les animations ne se chargent pas

1. Vérifiez que les URLs sont correctes et accessibles
2. Ouvrez la console du navigateur (F12) pour voir les erreurs
3. Vérifiez que les fichiers sont bien en format `.glb`

### Les animations ne s'appliquent pas correctement

- Les animations Mixamo peuvent nécessiter un retargeting manuel
- Assurez-vous que le format est "glTF" ou "FBX for Unity"
- Certaines animations peuvent ne pas être compatibles avec VRM

### Performance

- Limitez le nombre d'animations (5-10 max recommandé)
- Les fichiers GLB peuvent être volumineux, optimisez-les si nécessaire

## 📝 Exemple complet

```javascript
const animationUrls = [
    "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/idle.glb",
    "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/walking.glb",
    "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/dancing.glb",
    "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/waving.glb",
    "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/jumping.glb",
];
```

## 🎯 Prochaines étapes

1. Téléchargez vos animations depuis Mixamo
2. Hébergez-les sur GitHub ou votre serveur
3. Ajoutez les URLs dans `animationUrls`
4. Testez votre application !

---

**Note** : Si vous n'ajoutez pas d'animations, le système utilisera une simple rotation comme animation par défaut.


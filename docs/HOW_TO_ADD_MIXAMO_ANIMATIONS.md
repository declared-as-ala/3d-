# Comment ajouter des animations Mixamo GLB

## 🎯 Format recommandé : GLB (pas FBX)

**Important** : Utilisez le format **GLB** (glTF) au lieu de FBX pour une meilleure compatibilité avec VRM.

## 📥 Étapes pour télécharger depuis Mixamo

1. **Allez sur Mixamo.com** : https://www.mixamo.com/
   - Connectez-vous avec votre compte Adobe (gratuit)

2. **Choisissez un personnage** :
   - Sélectionnez n'importe quel personnage (ex: "Remy" ou "Y Bot")
   - Le personnage n'a pas d'importance, seule l'animation compte

3. **Parcourez les animations** :
   - Cliquez sur l'onglet "Animations"
   - Recherchez des animations populaires :
     - `idle` - Animation de repos
     - `walking` - Marche
     - `running` - Course
     - `dancing` - Danse
     - `waving` - Salutation
     - `jumping` - Saut
     - `sitting` - S'asseoir
     - `cheering` - Encourager
     - `pointing` - Pointer
     - `clapping` - Applaudir

4. **Téléchargez en format GLB** :
   - Cliquez sur "Download"
   - **Format IMPORTANT** : Choisissez **"glTF"** (pas FBX!)
   - ✅ Cochez "With Skin" si disponible
   - Cliquez sur "Download"

## 📤 Héberger vos animations

### Option 1 : GitHub (Recommandé)

1. Créez un dossier `animations` dans votre dépôt GitHub
2. Uploadez vos fichiers `.glb` dans ce dossier
3. Utilisez jsDelivr CDN pour les URLs :
   ```
   https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/nom-animation.glb
   ```

### Option 2 : Local (pour tester)

1. Placez vos fichiers `.glb` dans `docs/animations/`
2. Utilisez le chemin relatif : `"animations/nom-animation.glb"`

## 🔧 Ajouter au code

Ouvrez `docs/script.js` et trouvez la section `animationFiles` (ligne ~338) :

```javascript
const animationFiles = [
    // Ajoutez vos animations GLB ici
    "animations/idle.glb",
    "animations/walking.glb",
    "animations/dancing.glb",
    
    // Ou utilisez des URLs GitHub :
    // "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/idle.glb",
];
```

## ✅ Animations recommandées à télécharger

Voici une liste d'animations qui fonctionnent bien avec VRM :

1. **idle** - Animation de repos (essentielle)
2. **walking** - Marche normale
3. **running** - Course
4. **dancing** - Danse
5. **waving** - Salutation
6. **jumping** - Saut
7. **sitting** - S'asseoir
8. **cheering** - Encourager
9. **pointing** - Pointer du doigt
10. **clapping** - Applaudir

## 🚀 Test rapide

1. Téléchargez l'animation "idle" depuis Mixamo en format GLB
2. Placez-la dans `docs/animations/idle.glb`
3. Ajoutez `"animations/idle.glb"` dans `animationFiles`
4. Rechargez la page - l'animation devrait se jouer automatiquement!

## ⚠️ Notes importantes

- **Format GLB uniquement** : Les fichiers FBX ne fonctionnent pas bien avec VRM
- **Taille des fichiers** : Les animations GLB sont généralement plus petites que FBX
- **Retargeting automatique** : Le système adapte automatiquement les animations au squelette VRM
- **Rotation automatique** : Les animations changent toutes les 5 secondes si vous en avez plusieurs

## 🐛 Dépannage

### L'animation ne se charge pas
- Vérifiez que le fichier est bien en format `.glb` (pas `.fbx`)
- Vérifiez le chemin du fichier
- Ouvrez la console (F12) pour voir les erreurs

### L'animation ne s'applique pas correctement
- Certaines animations peuvent nécessiter un ajustement manuel
- Essayez d'autres animations si une ne fonctionne pas

---

**Besoin d'aide ?** Vérifiez la console du navigateur (F12) pour les messages d'erreur détaillés.


# Velocivector 0.1.0 alpha pour Windows

`Velocivector-Alpha-0.1.0-Windows-TEST-NON-SIGNE.exe` est le paquet de test local. Le fichier `.sha256` permet de vérifier son intégrité. Une publication publique nécessite un installateur signé par l’éditeur.

## Installation et mise à jour

L’installateur utilise le compte courant. Par défaut, le programme, le profil Velocivector et le dossier des plugins personnels sont regroupés dans `%LOCALAPPDATA%\Velocivector2D`. Le lanceur ouvre le moteur actuel dans une fenêtre Edge dédiée. Il requiert Microsoft Edge 109 ou ultérieur et .NET Framework 4.x. Node.js est utilisé pour les tests de développement.

| Emplacement | Contenu |
| --- | --- |
| `app\plugins` | Ateliers fournis avec Velocivector |
| `plugins-personnels` | Dossier proposé pour les ateliers créés et les plugins importés |
| `plugins-folder.txt` | Chemin du dossier de plugins personnels sélectionné |
| `Profil` | Préférences, raccourcis, autorisations et fichiers récents de cette installation |

Choisissez un dossier personnel pendant l’installation ou utilisez ensuite **Changer le dossier des plugins personnels** dans le menu Démarrer. Relancez Velocivector après le changement. Ce changement ne déplace aucun atelier. Pour publier ou supprimer un atelier généré, sélectionnez ce même dossier dans la boîte de dialogue de la Fabrique.

Pour une mise à jour, fermez Velocivector et relancez l’installateur dans le dossier existant. L’installateur remplace les fichiers livrés et conserve les dossiers personnels et le profil. La désinstallation conserve également ces données. Les dessins restent dans leurs dossiers de travail. Un atelier créé dans la version portable peut être copié dans le dossier personnel de la version installée. Celle-ci démarre avec son propre profil.

## Compatibilité

- **Windows 10 et 11** avec une version d’Edge compatible avec le système.
- **Windows 7 SP1, 8 et 8.1** ciblés en mode ancien avec Edge 109 et .NET Framework 4.x déjà disponibles. Ces versions doivent être validées sur machines virtuelles. Microsoft a arrêté la maintenance d’Edge 109 sur ces systèmes. [Notes de version d’Edge](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnote-archive-stable-channel)
- **Windows 9** ne correspond à aucune version publiée.

## Construction et signature

Le script [Build-Windows.ps1](../packaging/Build-Windows.ps1) utilise le compilateur `csc.exe` de .NET Framework et Inno Setup. Inno Setup 6.7.4 a servi à générer ce paquet. Respectez les conditions de licence de votre édition du compilateur. [Téléchargements Inno Setup](https://jrsoftware.org/inno-setup/downloads)

```powershell
.\packaging\Build-Windows.ps1 -InnoCompiler 'C:\chemin\vers\ISCC.exe'
```

Pour un paquet public, deux parcours permettent d’obtenir une signature Authenticode reconnue par Windows. **Velocivector 0.1.0 alpha** est le nom du produit. Le champ **Éditeur vérifié** de Windows affichera l’identité validée par le prestataire.

- **Publication en nom propre depuis la France.** Demandez un certificat de signature de code à validation individuelle (IV). Sur le portail de SSL.com, choisissez le certificat IV, puis le mode de stockage de la clé, sur jeton ou via eSigner. Le titulaire transmet ses justificatifs au prestataire et valide lui-même la commande. Pour eSigner, configurez son adaptateur CKA pour rendre le certificat accessible dans le magasin Windows. [Certificat IV](https://www.ssl.com/fr/products/software-integrity/code-signing/iv/) · [Vérification d’identité](https://www.ssl.com/how-to/validation-process-for-document-signing-code-signing-and-ev-code-signing-certificates/) · [Configuration de CKA](https://www.ssl.com/how-to/how-to-install-ssl-com-esigner-cloud-key-adapter-cka/)
- **Publication au nom de la structure juridique qui porte le Fablab.** Un représentant autorisé peut ouvrir un compte Azure Artifact Signing avec un abonnement payant, demander une validation d’identité publique de type organisation, puis créer un profil **Public Trust** et attribuer le rôle de signataire. Le tarif Basic indiqué par Microsoft est de 9,99 USD par mois. [Création et validation](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart) · [Tarifs](https://learn.microsoft.com/azure/artifact-signing/how-to-change-sku)

### Fabriquer le paquet signé

Le script signe l’exécutable, l’installateur et le désinstallateur avec horodatage. Le paquet signé porte le même nom sans le suffixe `TEST-NON-SIGNE`. SignTool fait partie des outils de développement Windows. Le fabricant du paquet peut utiliser la copie locale sous `packaging/.tools/Windows-SDK` lorsqu’elle est disponible. [Documentation SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool)

Avec un certificat visible dans le magasin Windows de l’utilisateur courant, relevez son empreinte publique et exécutez la construction.

```powershell
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
    Select-Object Subject, Thumbprint, NotAfter
```

```powershell
.\packaging\Build-Windows.ps1 -InnoCompiler 'C:\chemin\vers\ISCC.exe' -SignTool 'C:\chemin\vers\signtool.exe' -CertificateThumbprint 'EMPREINTE_DU_CERTIFICAT'
```

Avec Azure Artifact Signing, configurez l’authentification sur le poste de signature ainsi que le fichier de métadonnées du profil Azure. [Instructions Microsoft pour SignTool et le profil Azure](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations)

```powershell
.\packaging\Build-Windows.ps1 -InnoCompiler 'C:\chemin\vers\ISCC.exe' -SignTool 'C:\chemin\vers\signtool.exe' -SigningLibrary 'C:\chemin\vers\Azure.CodeSigning.Dlib.dll' -SigningMetadata 'C:\chemin\vers\metadata.json'
```

Pour les anciens Windows, vérifiez la chaîne de confiance et l’horodatage sur les machines cibles avant publication. Les justificatifs d’identité, les identifiants, les codes d’authentification et les clés privées restent chez le titulaire et le prestataire.

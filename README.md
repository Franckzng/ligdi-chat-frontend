# 💬 Ligdi Chat - Application complète

Ligdi Chat est une application de messagerie en temps réel construite avec un **stack moderne** :  
- **Frontend** : React + Vite + TailwindCSS (déployé sur Vercel)  
- **Backend** : Node.js + Express + Prisma + Socket.IO (déployé sur Render)  
- **Base de données** : PostgreSQL (hébergée sur Railway)  

---

## 🚀 Fonctionnalités principales
- Authentification sécurisée avec JWT (inscription / connexion)
- Conversations privées entre utilisateurs
- Messages en temps réel avec **Socket.IO**
- Statut en ligne / hors ligne
- Réactions avec emojis
- Upload d’images et de vidéos
- Interface moderne, responsive et intuitive

---

## 🛠️ Stack technique
### Frontend
- React 18 + Vite
- TypeScript
- TailwindCSS
- Axios
- Socket.IO Client

### Backend
- Node.js + Express
- Prisma ORM
- PostgreSQL
- Socket.IO
- Multer (upload fichiers)
- Morgan (logs)

### Hébergement
- **Frontend** : Vercel  
- **Backend** : Render  
- **Base de données** : Railway  

---

## ⚙️ Installation locale

### 1. Cloner les dépôts
```bash
# Backend
git clone https://github.com/ton-compte/ligdi-chat-backend.git
cd ligdi-chat-backend
npm install

# Frontend
git clone https://github.com/ton-compte/ligdi-chat-frontend.git
cd ligdi-chat-frontend
npm install

GIFT LINK SYSTEM - SETUP

1) Upload this project to a new GitHub repository.
2) Create a new Web Service on Render, connect the repository.
3) Build Command: npm install
4) Start Command: npm start
5) Add environment variables:
   ADMIN_KEY = a long private admin password
   FIREBASE_DATABASE_URL = your Firebase Realtime Database URL
   FIREBASE_STORAGE_BUCKET = your Firebase Storage bucket name
   FIREBASE_SERVICE_ACCOUNT = one-line JSON service account key
   OR use FIREBASE_SERVICE_ACCOUNT_BASE64 instead.
   Alternatively use FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
6) In Firebase, enable Realtime Database and Storage. Give the service account permission to upload to Storage.
7) Open https://YOUR-RENDER-URL/admin
8) Create gifts, upload photos/music, save, then copy the generated /gift/slug link.

Data is stored under giftLinkSystem/gifts in Realtime Database. Uploaded files go under gift-link-system/ in Firebase Storage.

IMPORTANT: Set Firebase Storage rules/permissions and service account access correctly. Keep ADMIN_KEY and service account credentials private. This starter does not include custom domain setup.

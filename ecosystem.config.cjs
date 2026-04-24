module.exports = {
  apps: [
    {
      name: "tokovespajogja-store",
      cwd: __dirname,
      script: "server.mjs",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "4173",
        TVJ_PUBLIC_ORIGIN: "https://tokovespajogja.store",
        TVJ_APPS_SCRIPT_URL:
          "https://script.google.com/macros/s/AKfycbxV8rZB9MZaYU-cKYdXfFbJg7ACvf2OgZUUom5cNSGigTb3_SpMbNyBk7aiuX8M3MPu/exec",
        TVJ_APPS_SCRIPT_TIMEOUT_MS: "18000"
      }
    }
  ]
}

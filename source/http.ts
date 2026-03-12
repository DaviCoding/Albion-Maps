import axios from "axios"

export const http = axios.create({
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9", // Da pra pegar o idioma por aqui
        "Referer": "https://albiononline.com/"
    },
    timeout: 10_000
})
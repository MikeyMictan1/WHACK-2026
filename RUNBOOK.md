
## Testing on a phone (same Wi-Fi)

Vite listens on the LAN (`server.host: true`), so a phone on the same Wi-Fi as the laptop can open the site.

1. Find the laptop's Wi-Fi address: `ipconfig` in PowerShell, the IPv4 address under "Wireless LAN adapter Wi-Fi" (ignore VMware/WSL/vEthernet adapters).
2. On the phone open `http://<that-ip>:5173`.
3. First time only: allow Node.js through Windows Firewall on **private** networks when prompted.

The backend stays on 127.0.0.1; Vite's proxy calls it from the laptop. Login works over plain http because
`COOKIE_SECURE` defaults to false. If the phone can't connect, the Wi-Fi probably isolates clients
(common at venues): use the phone's hotspot and join the laptop to it.

To test two accounts on one machine, use a normal window plus an incognito window (cookies are per profile).

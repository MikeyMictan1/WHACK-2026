from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings. Values come from environment variables or a .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Whack Template API"
    database_url: str = "sqlite:///./app.db"

    jwt_secret: str = "dev-only-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    cookie_name: str = "access_token"
    cookie_secure: bool = False  # set True in production (HTTPS)

    cors_origins: list[str] = ["http://localhost:5173"]

    # Folder with the built frontend (npm run build). When set and it exists, the backend serves
    # the site too (one origin in production). Empty locally: Vite serves the frontend.
    frontend_dist: str = ""

    anthropic_api_key: str = ""  # set ANTHROPIC_API_KEY in .env

    # The built-in admin account. It can't be registered or deleted; startup recreates it if
    # it's missing and resets its role and password to these values.
    admin_username: str = "admin"
    admin_password: str = "admin-change-me"

    # Lets "Simulate tap" stand in for a real NFC tap (shop purchases, plan switches). Off for a real deployment.
    allow_simulated_tap: bool = True

    # Android phones can read the card themselves (Chrome Web NFC) and send its id. The browser
    # reports the id, so it can't prove a physical tap the way a reader can: fine for play money.
    allow_phone_tap: bool = True

    # Contact the push services (Google/Apple) can reach about our notifications (Web Push "sub").
    push_subject: str = "mailto:whack-demo@example.com"

    # Laptop bridge (python -m app.bridge): lets a deployed backend use the NFC reader and LED board
    # plugged into a laptop. Same token on both sides; empty disables the bridge endpoint.
    bridge_token: str = ""
    # Only used by the laptop running the bridge: the deployed site, e.g. https://whack.up.railway.app
    bridge_url: str = ""

    # Key for encrypting data saved on NFC cards. Falls back to jwt_secret.
    # Changing it makes every existing card unreadable.
    nfc_secret: str = ""

    # Where the LED "Weather" skin looks (Open-Meteo, no key needed). Default: London.
    weather_lat: float = 51.5074
    weather_lon: float = -0.1278


settings = Settings()

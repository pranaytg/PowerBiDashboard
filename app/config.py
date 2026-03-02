"""Application configuration using pydantic-settings."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase
    supabase_url: str
    supabase_key: str

    # Amazon SP-API (AWS credentials no longer required since Oct 2023)
    sp_api_refresh_token: str = ""
    sp_api_lwa_app_id: str = ""
    sp_api_lwa_client_secret: str = ""
    sp_api_aws_access_key: str = ""  # Deprecated, not needed
    sp_api_aws_secret_key: str = ""  # Deprecated, not needed
    sp_api_role_arn: str = ""  # Deprecated, not needed
    sp_api_marketplace_id: str = "A21TJRUUN4KGV"  # Amazon India

    # App
    app_env: str = "production"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "info"

    @property
    def sp_api_configured(self) -> bool:
        """Check if SP-API credentials are properly configured (LWA only)."""
        return bool(
            self.sp_api_refresh_token
            and self.sp_api_lwa_app_id
            and self.sp_api_lwa_client_secret
        )


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

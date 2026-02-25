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

    # Amazon SP-API
    sp_api_refresh_token: str = "your_refresh_token_here"
    sp_api_lwa_app_id: str = "your_lwa_app_id_here"
    sp_api_lwa_client_secret: str = "your_lwa_client_secret_here"
    sp_api_aws_access_key: str = "your_aws_access_key_here"
    sp_api_aws_secret_key: str = "your_aws_secret_key_here"
    sp_api_role_arn: str = "your_role_arn_here"
    sp_api_marketplace_id: str = "A21TJRUUN4KGV"  # Amazon India

    # App
    app_env: str = "production"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "info"

    @property
    def sp_api_configured(self) -> bool:
        """Check if SP-API credentials are properly configured."""
        return (
            self.sp_api_refresh_token != "your_refresh_token_here"
            and self.sp_api_lwa_app_id != "your_lwa_app_id_here"
            and self.sp_api_lwa_client_secret != "your_lwa_client_secret_here"
        )


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

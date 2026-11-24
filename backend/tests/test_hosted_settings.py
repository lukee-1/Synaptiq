from app.core.settings import Settings


def test_cloud_api_queues_to_external_worker_without_local_credentials():
    settings = Settings(
        _env_file=None,
        app_env="production",
        allowed_origins=["https://synaptiq.example.com"],
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="publishable-fixture",
        worker_mode="external",
        model_name="",
        executor_url="",
    )
    assert settings.model_jobs_configured and settings.execution_jobs_configured
    assert not settings.worker_token.get_secret_value()
    assert not settings.model_api_key.get_secret_value()
    assert not settings.executor_token.get_secret_value()


def test_unconfigured_local_api_still_rejects_execution_and_ai_jobs():
    settings = Settings(
        _env_file=None, worker_mode="local", model_name="", executor_url=""
    )
    assert not settings.model_jobs_configured
    assert not settings.execution_jobs_configured

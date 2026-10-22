import pytest

from app.services.beneficiary import SyntheticBeneficiaryProvider
from app.services.entrepreneur import EntrepreneurContext


@pytest.mark.asyncio
async def test_synthetic_provider_requires_explicit_external_id() -> None:
    provider = SyntheticBeneficiaryProvider()
    assert (await provider.get_beneficiary("synthetic-demo-001")).source == "synthetic"
    assert await provider.get_beneficiary("Coffee House") is None


def test_context_marks_profile_values_as_user_stated() -> None:
    context = EntrepreneurContext(
        preferred_language="am",
        confirmed={},
        user_stated={"business_type": "coffee shop", "business_stage": "operating"},
    )
    prompt = context.to_prompt()
    assert "user-provided profile details" in prompt
    assert "coffee shop" in prompt
    assert "proof of finances" in prompt

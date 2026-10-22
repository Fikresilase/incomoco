"""Provider boundary for future verified Inkomoko beneficiary integrations."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True)
class BeneficiaryRecord:
    external_id: str
    business_name: str | None = None
    business_type: str | None = None
    business_stage: str | None = None
    source: str = "synthetic"


class BeneficiaryProfileProvider(Protocol):
    async def get_beneficiary(self, external_id: str) -> BeneficiaryRecord | None: ...
    async def get_business_profile(self, external_id: str) -> BeneficiaryRecord | None: ...
    async def get_training_history(self, external_id: str) -> list[dict]: ...


class SyntheticBeneficiaryProvider:
    """Clearly synthetic fixture provider; never matches by name or phone."""

    def __init__(self, records: dict[str, BeneficiaryRecord] | None = None):
        self.records = records or {
            "synthetic-demo-001": BeneficiaryRecord(
                external_id="synthetic-demo-001", business_name="Synthetic Coffee House", business_type="coffee shop", business_stage="operating"
            )
        }

    async def get_beneficiary(self, external_id: str) -> BeneficiaryRecord | None:
        return self.records.get(external_id)

    async def get_business_profile(self, external_id: str) -> BeneficiaryRecord | None:
        return await self.get_beneficiary(external_id)

    async def get_training_history(self, external_id: str) -> list[dict]:
        return [] if external_id not in self.records else [{"course": "synthetic-example", "status": "notional"}]

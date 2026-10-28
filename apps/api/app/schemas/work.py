from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]


class TodoIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Title
    due_date: date | None = None
    completed: bool = False
    status: Literal["assigned", "in_progress", "completed"] | None = None


class TransactionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["income", "expense"]
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2, allow_inf_nan=False)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    description: Title
    occurred_on: date


class CustomerIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=160)
    contact: str = Field(default="", max_length=240)
    notes: str = Field(default="", max_length=2000)
    follow_up_on: date | None = None

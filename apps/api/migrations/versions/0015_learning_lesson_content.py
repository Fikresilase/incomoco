"""Add structured lesson steps for the Financial Basics demo course."""
from collections.abc import Sequence
import json

import sqlalchemy as sa
from alembic import op

revision = "0015_learning_lesson_content"
down_revision = "0014_learning_course_structure"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONTENT = {
    "Understand income and expenses": {
        "objective": "Tell apart money earned and money spent by the business.",
        "sections": [{"title": "Income", "body": "Income is money the business receives from selling products or services. Record the date, what was sold, and the amount."}, {"title": "Expenses", "body": "Expenses are costs paid to run the business, such as stock, ingredients, transport, packaging, rent, or phone credit."}],
        "example": "A cafe receives ETB 1,200 from sales. It pays ETB 450 for ingredients. Record both numbers; they answer different business questions.",
        "practice": {"question": "Which is an expense for a cafe?", "options": ["Money from selling coffee", "Money paid for coffee beans", "A customer's payment"], "answer": 1, "feedback": "Correct. Coffee beans are a cost needed to make what the cafe sells."},
        "apply": "Write down yesterday's total sales and each expense separately.",
    },
    "Track daily expenses": {
        "objective": "Create a daily expense habit that is quick enough to keep.",
        "sections": [{"title": "The four details", "body": "For every expense, write the date, item, amount in ETB, and reason. Keep receipts when possible."}, {"title": "End-of-day check", "body": "Before closing, add the day's expenses. Compare the total with your cash record and investigate differences calmly."}],
        "example": "A shop records ETB 80 for transport, ETB 350 for packaging, and ETB 900 for stock. The daily expense total is ETB 1,330.",
        "practice": {"question": "What should you record with an expense amount?", "options": ["Only the amount", "The date, item, amount, and reason", "The customer's name only"], "answer": 1, "feedback": "Correct. These four details make the record useful later."},
        "apply": "Record three real expenses from your business today.",
    },
    "Calculate the cost of one product": {
        "objective": "Know what one item costs before choosing its price.",
        "sections": [{"title": "Add the inputs", "body": "List the ingredients or stock used for one item. Divide a shared purchase by the number of items it produces."}, {"title": "Keep assumptions visible", "body": "If you are estimating, write the estimate. Improve it when you have better records."}],
        "example": "ETB 300 of ingredients make five sandwiches. ETB 300 divided by 5 gives a direct ingredient cost of ETB 60 per sandwich.",
        "practice": {"question": "ETB 240 makes 4 products. What is the direct cost of one?", "options": ["ETB 40", "ETB 60", "ETB 960"], "answer": 1, "feedback": "Correct. 240 divided by 4 equals ETB 60."},
        "apply": "Choose one product and write the cost of each input used to make it.",
    },
    "Understand profit": {
        "objective": "Use a simple calculation to see what remains after direct costs.",
        "sections": [{"title": "The calculation", "body": "Simple gross profit is sales minus the direct cost of the products sold. Keep other business expenses visible too."}, {"title": "Use your records", "body": "Profit is meaningful only when sales and costs are recorded for the same period."}],
        "example": "Sales are ETB 1,000 and direct product costs are ETB 650. Simple gross profit is ETB 350.",
        "practice": {"question": "Sales are ETB 900 and direct costs are ETB 500. What remains?", "options": ["ETB 400", "ETB 1,400", "ETB 500"], "answer": 0, "feedback": "Correct. 900 minus 500 equals ETB 400."},
        "apply": "Calculate the simple gross profit for one recent sales day.",
    },
    "Set a practical selling price": {
        "objective": "Review prices using cost, customer value, and business needs.",
        "sections": [{"title": "Start with cost", "body": "A price should cover the direct cost and contribute toward other business expenses. Do not guess without recording the cost."}, {"title": "Check the market", "body": "Compare similar offers and ask customers what matters to them. A lower price is not always the best value."}],
        "example": "If one product costs ETB 60 to make, a business reviews a price above ETB 60 and checks whether customers value the quality and service.",
        "practice": {"question": "What should you check before changing a price?", "options": ["Only a competitor's price", "Your cost, customer value, and business expenses", "A random number"], "answer": 1, "feedback": "Correct. A price decision needs your records and customer context."},
        "apply": "Review one product price and write down the reason for keeping or changing it.",
    },
    "Manage weekly cash flow": {
        "objective": "Plan the timing of money received and money paid during the week.",
        "sections": [{"title": "Look ahead", "body": "List expected money coming in and important payments due this week. Timing matters even when the business is profitable."}, {"title": "Choose carefully", "body": "Prioritize essential commitments and avoid buying more stock than your records support."}],
        "example": "A trader expects ETB 2,000 in sales and must pay ETB 1,100 for stock and ETB 300 for transport. The plan makes ETB 600 visible before other costs.",
        "practice": {"question": "What is cash-flow planning mainly about?", "options": ["Timing money in and out", "Guessing next year's profit", "Counting customers only"], "answer": 0, "feedback": "Correct. It helps you prepare for payments and receipts at the right time."},
        "apply": "List this week's expected receipts and three payments with their dates.",
    },
}


def upgrade() -> None:
    op.add_column("learning_resources", sa.Column("lesson_content", sa.JSON(), nullable=True))
    conn = op.get_bind()
    for title, content in CONTENT.items():
        conn.execute(sa.text("UPDATE learning_resources SET lesson_content = CAST(:content AS jsonb) WHERE title = :title AND course_key = 'financial_basics'"), {"title": title, "content": json.dumps(content)})


def downgrade() -> None:
    op.drop_column("learning_resources", "lesson_content")

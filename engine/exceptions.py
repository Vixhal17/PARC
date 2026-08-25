class ExceptionReason:
    CLEAN_MATCH = "CLEAN_MATCH"
    MISSING_PAYMENT = "MISSING_PAYMENT"
    MISSING_SETTLEMENT = "MISSING_SETTLEMENT"
    AMOUNT_MISMATCH = "AMOUNT_MISMATCH"
    TIMING_DELAY = "TIMING_DELAY"
    DUPLICATE_UTR = "DUPLICATE_UTR"
    UNRESOLVED = "UNRESOLVED"

    @classmethod
    def get_description(cls, reason):
        descriptions = {
            cls.CLEAN_MATCH: "Successfully reconciled across all data sources.",
            cls.MISSING_PAYMENT: "Order exists, but no corresponding payment record was found.",
            cls.MISSING_SETTLEMENT: "Payment was captured, but no settlement record exists for this payment.",
            cls.AMOUNT_MISMATCH: "Settled/Bank amount differs from the expected (Order Amount - Fees - Taxes).",
            cls.TIMING_DELAY: "Bank credited the settlement more than 48 hours after the settlement date.",
            cls.DUPLICATE_UTR: "The same UTR was found across multiple distinct settlements.",
            cls.UNRESOLVED: "Record is completely orphaned or cannot be reconciled due to an unknown error."
        }
        return descriptions.get(reason, "Unknown Exception")

def get_checked_steps(reason):
    steps = {
        ExceptionReason.MISSING_PAYMENT: [
            "Merged orders with payments on order_id",
            "payment_id is NaN: no payment found for order"
        ],
        ExceptionReason.MISSING_SETTLEMENT: [
            "Exploded settlements by payment_id",
            "Merged payments with settlements",
            "Merged settlements with bank_statement on UTR",
            "Applied RapidFuzz fallback for UTRs (>=90 ratio)",
            "utr_bs is still NaN: no matching bank statement found"
        ],
        ExceptionReason.UNRESOLVED: [
            "Exploded settlements by payment_id",
            "Merged payments with settlements",
            "settlement_id is NaN: payment is orphaned with no settlement"
        ],
        ExceptionReason.DUPLICATE_UTR: [
            "Grouped settlements by UTR",
            "Counted unique settlement_ids per UTR",
            "Found count > 1 for this UTR"
        ],
        ExceptionReason.AMOUNT_MISMATCH: [
            "Merged settlements with bank_statement",
            "Checked abs(credited_amount - settled_amount)",
            "Difference exceeded tolerance (1.00)"
        ],
        ExceptionReason.TIMING_DELAY: [
            "Parsed settled_at and credited_at to datetime",
            "Calculated hours difference",
            "Difference exceeded tolerance (48.0 hours)"
        ]
    }
    return steps.get(reason, ["No specific checks logged for this status."])


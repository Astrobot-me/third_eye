const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const transactions = new Map();

function generateTransactionId() {
  return `TXN_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function validateUpiId(upiId) {
  return upiId && upiId.includes("@") && upiId.length > 3;
}

function generateUpiDeepLink(receiverUpiId, amount, note, payeeName) {
  const params = new URLSearchParams({
    pa: receiverUpiId,
    am: amount.toString(),
    cu: "INR",
  });

  if (payeeName) {
    params.append("pn", payeeName);
  }

  if (note) {
    params.append("tn", note);
  }

  return `upi://pay?${params.toString()}`;
}

app.post("/api/initiate-payment", (req, res) => {
  const { amount, receiver_upi_id, note, transaction_id } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid amount: must be greater than 0",
    });
  }

  if (!receiver_upi_id || !validateUpiId(receiver_upi_id)) {
    return res.status(400).json({
      success: false,
      error: "Invalid UPI ID: must contain @",
    });
  }

  const txnId = transaction_id || generateTransactionId();
  const payeeName = receiver_upi_id.split("@")[0];
  const paymentUrl = generateUpiDeepLink(receiver_upiId, amount, note, payeeName);

  transactions.set(txnId, {
    id: txnId,
    amount,
    receiver_upi_id,
    note,
    status: "pending",
    created_at: new Date().toISOString(),
  });

  res.json({
    success: true,
    payment_url: paymentUrl,
    status: "pending",
    transaction_id: txnId,
  });
});

app.post("/api/verify-payment", (req, res) => {
  const { transaction_id, status } = req.body;

  if (!transaction_id) {
    return res.status(400).json({
      success: false,
      error: "Transaction ID required",
    });
  }

  const txn = transactions.get(transaction_id);

  if (!txn) {
    return res.status(404).json({
      success: false,
      error: "Transaction not found",
    });
  }

  if (status === "success" || status === "failed" || status === "pending") {
    txn.status = status;
    txn.updated_at = new Date().toISOString();
  }

  res.json({
    success: true,
    transaction: txn,
  });
});

app.get("/api/transaction/:id", (req, res) => {
  const { id } = req.params;
  const txn = transactions.get(id);

  if (!txn) {
    return res.status(404).json({
      success: false,
      error: "Transaction not found",
    });
  }

  res.json({
    success: true,
    transaction: txn,
  });
});

app.get("/api/transactions", (req, res) => {
  const allTransactions = Array.from(transactions.values());
  res.json({
    success: true,
    transactions: allTransactions,
  });
});

app.listen(PORT, () => {
  console.log(`UPI Payment Server running on http://localhost:${PORT}`);
});

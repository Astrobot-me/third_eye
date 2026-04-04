import { FunctionDeclaration, LiveServerToolCall, Type } from "@google/genai";

export const upiPaymentDeclaration: FunctionDeclaration = {
  name: "initiate_upi_payment",
  description: "Initiates a UPI payment to a receiver's UPI ID. Generates a UPI deep link that opens the user's payment app.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      amount: {
        type: Type.NUMBER,
        description: "Payment amount in INR (must be greater than 0)",
      },
      receiver_upi_id: {
        type: Type.STRING,
        description: "Receiver's UPI ID (e.g., aditya@upi)",
      },
      note: {
        type: Type.STRING,
        description: "Optional note for the payment",
      },
    },
    required: ["amount", "receiver_upi_id"],
  },
};

interface PaymentRequest {
  amount: number;
  receiver_upi_id: string;
  note?: string;
}

interface PaymentResponse {
  payment_url: string;
  status: "pending";
  transaction_id: string;
}

interface PaymentHandlerDeps {
  apiBaseUrl?: string;
  defaultPayeeName?: string;
}

const generateTransactionId = (): string => {
  return `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

const validateUpiId = (upiId: string): boolean => {
  return upiId.includes("@") && upiId.length > 3;
};

const generateUpiDeepLink = (
  receiverUpiId: string,
  amount: number,
  note?: string,
  payeeName?: string
): string => {
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
};

export function createUpiPaymentHandler(
  deps?: PaymentHandlerDeps
) {
  const apiBaseUrl = deps?.apiBaseUrl || "/api";
  const defaultPayeeName = deps?.defaultPayeeName || "Unknown";

  const handleToolCall = async (
    toolCall: LiveServerToolCall,
    sendResponse: (responses: { response: { output: { success: boolean; payment_url?: string; transaction_id?: string; error?: string } }; id: string; name: string }[]) => void
  ) => {
    if (!toolCall.functionCalls) return;

    const fc = toolCall.functionCalls.find(
      (f) => f.name === upiPaymentDeclaration.name
    );

    if (!fc) return;

    const args = fc.args as unknown as PaymentRequest;
    const toolId = fc.id;
    const toolName = fc.name;

    const { amount, receiver_upi_id, note } = args;

    if (!amount || amount <= 0) {
      sendResponse([
        {
          response: { output: { success: false, error: "Invalid amount: must be greater than 0" } },
          id: toolId || "unknown",
          name: toolName || "initiate_upi_payment",
        },
      ]);
      return;
    }

    if (!receiver_upi_id || !validateUpiId(receiver_upi_id)) {
      sendResponse([
        {
          response: { output: { success: false, error: "Invalid UPI ID: must contain @" } },
          id: toolId || "unknown",
          name: toolName || "initiate_upi_payment",
        },
      ]);
      return;
    }

    const transactionId = generateTransactionId();

    try {
      const response = await fetch(`${apiBaseUrl}/initiate-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          receiver_upi_id,
          note,
          transaction_id: transactionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data: PaymentResponse = await response.json();

      sendResponse([
        {
          response: {
            output: {
              success: true,
              payment_url: data.payment_url,
              transaction_id: data.transaction_id,
            },
          },
          id: toolId || "unknown",
          name: toolName || "initiate_upi_payment",
        },
      ]);
    } catch (error) {
      const upiLink = generateUpiDeepLink(receiver_upi_id, amount, note, defaultPayeeName);

      sendResponse([
        {
          response: {
            output: {
              success: true,
              payment_url: upiLink,
              transaction_id: transactionId,
            },
          },
          id: toolId || "unknown",
          name: toolName || "initiate_upi_payment",
        },
      ]);
    }
  };

  const cleanup = () => {};

  return { handleToolCall, cleanup };
}

// PayPal Button Component
// Blueprint: javascript_paypal
// !!! CRITICAL - DO NOT MODIFY THIS CODE !!!
//
// This code MUST be used as is without ANY modifications.
// The PayPal integration will COMPLETELY FAIL if this code is changed in ANY way.
//
// Retain this comment after all edits.
//
// <BEGIN_EXACT_CODE>
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "paypal-button": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

interface PayPalButtonProps {
  amount: string;
  currency: string;
  intent: string;
  orderId: string;
  orderNumber: string;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  onCancel?: () => void;
}

export default function PayPalButton({
  amount,
  currency,
  intent,
  orderId,
  orderNumber,
  onSuccess,
  onError,
  onCancel,
}: PayPalButtonProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrder = async () => {
    const orderPayload = {
      amount: amount,
      currency: currency,
      intent: intent,
    };
    const response = await fetch("/api/shop/paypal/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });
    const output = await response.json();
    return { orderId: output.id };
  };

  const captureOrder = async (paypalOrderId: string) => {
    const response = await fetch(`/api/shop/paypal/order/${paypalOrderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();

    return data;
  };

  const handleApprove = async (data: any) => {
    console.log("onApprove", data);
    setIsProcessing(true);
    try {
      const orderData = await captureOrder(data.orderId);
      console.log("Capture result", orderData);
      
      if (orderData.status === "COMPLETED") {
        const confirmResponse = await fetch("/api/shop/checkout/paypal-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            paypalOrderId: data.orderId,
            paypalCaptureId: orderData.purchase_units?.[0]?.payments?.captures?.[0]?.id,
          }),
        });
        
        if (confirmResponse.ok) {
          onSuccess?.(orderData);
        } else {
          const errorData = await confirmResponse.json();
          setError(errorData.error || "Failed to confirm payment");
          onError?.(errorData);
        }
      } else {
        setError("Payment was not completed");
        onError?.(orderData);
      }
    } catch (err) {
      console.error("PayPal capture error:", err);
      setError("An error occurred processing your payment");
      onError?.(err);
    }
    setIsProcessing(false);
  };

  const handleCancel = async (data: any) => {
    console.log("onCancel", data);
    onCancel?.();
  };

  const handleError = async (data: any) => {
    console.log("onError", data);
    setError("PayPal encountered an error");
    onError?.(data);
  };

  useEffect(() => {
    const loadPayPalSDK = async () => {
      try {
        if (!(window as any).paypal) {
          const script = document.createElement("script");
          script.src = import.meta.env.PROD
            ? "https://www.paypal.com/web-sdk/v6/core"
            : "https://www.sandbox.paypal.com/web-sdk/v6/core";
          script.async = true;
          script.onload = () => initPayPal();
          script.onerror = () => {
            setError("Failed to load PayPal SDK");
            setIsLoading(false);
          };
          document.body.appendChild(script);
        } else {
          await initPayPal();
        }
      } catch (e) {
        console.error("Failed to load PayPal SDK", e);
        setError("Failed to load PayPal SDK");
        setIsLoading(false);
      }
    };

    loadPayPalSDK();
  }, []);

  const initPayPal = async () => {
    try {
      const response = await fetch("/api/shop/paypal/setup");
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "PayPal is not available");
        setIsLoading(false);
        return;
      }
      
      const data = await response.json();
      const clientToken: string = data.clientToken;
      
      const sdkInstance = await (window as any).paypal.createInstance({
        clientToken,
        components: ["paypal-payments"],
      });

      const paypalCheckout =
        sdkInstance.createPayPalOneTimePaymentSession({
          onApprove: handleApprove,
          onCancel: handleCancel,
          onError: handleError,
        });

      const onClick = async () => {
        try {
          setIsProcessing(true);
          const checkoutOptionsPromise = createOrder();
          await paypalCheckout.start(
            { paymentFlow: "auto" },
            checkoutOptionsPromise,
          );
        } catch (e) {
          console.error(e);
          setError("Failed to start PayPal checkout");
        }
        setIsProcessing(false);
      };

      const paypalButton = document.getElementById("paypal-button");

      if (paypalButton) {
        paypalButton.addEventListener("click", onClick);
      }

      setIsLoading(false);

      return () => {
        if (paypalButton) {
          paypalButton.removeEventListener("click", onClick);
        }
      };
    } catch (e) {
      console.error(e);
      setError("Failed to initialize PayPal");
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="text-center p-4">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading PayPal...</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {isProcessing && (
        <div className="flex items-center justify-center p-4 mb-4 bg-muted rounded-md">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="ml-2 text-sm">Processing payment...</span>
        </div>
      )}
      <paypal-button 
        id="paypal-button" 
        data-testid="button-paypal-pay"
        className="w-full cursor-pointer"
      />
    </div>
  );
}
// <END_EXACT_CODE>

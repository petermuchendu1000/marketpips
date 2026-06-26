// ============================================================
// M-Pesa STK Push Integration (Safaricom Kenya/Tanzania)
// Docs: https://developer.safaricom.co.ke/Documentation
// ============================================================

import axios from 'axios'

const MPESA_BASE_URL = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY!
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET!
const SHORTCODE = process.env.MPESA_SHORTCODE || '174379'
const PASSKEY = process.env.MPESA_PASSKEY!
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL!

interface MpesaAccessTokenResponse {
  access_token: string
  expires_in: string
}

interface STKPushResponse {
  MerchantRequestID: string
  CheckoutRequestID: string
  ResponseCode: string
  ResponseDescription: string
  CustomerMessage: string
}

interface STKQueryResponse {
  ResponseCode: string
  ResponseDescription: string
  MerchantRequestID: string
  CheckoutRequestID: string
  ResultCode: string
  ResultDesc: string
}

interface MpesaCallbackBody {
  Body: {
    stkCallback: {
      MerchantRequestID: string
      CheckoutRequestID: string
      ResultCode: number
      ResultDesc: string
      CallbackMetadata?: {
        Item: Array<{
          Name: string
          Value: string | number
        }>
      }
    }
  }
}

// Get OAuth access token
async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64')

  const response = await axios.get<MpesaAccessTokenResponse>(
    `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
      timeout: 10000,
    }
  )

  return response.data.access_token
}

// Generate password (Base64 of Shortcode + Passkey + Timestamp)
function generatePassword(timestamp: string): string {
  const data = `${SHORTCODE}${PASSKEY}${timestamp}`
  return Buffer.from(data).toString('base64')
}

// Format timestamp: YYYYMMDDHHmmss
function getTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14)
}

// Format phone number to 254XXXXXXXXX
export function formatMpesaPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')

  if (cleaned.startsWith('254') && cleaned.length === 12) {
    return cleaned
  }
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `254${cleaned.slice(1)}`
  }
  if (cleaned.startsWith('7') && cleaned.length === 9) {
    return `254${cleaned}`
  }
  if (cleaned.startsWith('+254')) {
    return cleaned.slice(1)
  }

  throw new Error(`Invalid M-Pesa phone number format: ${phone}`)
}

// Initiate STK Push (Lipa na M-Pesa Online)
export async function initiateMpesaSTKPush({
  phone,
  amount,
  accountReference,
  transactionDesc,
  depositId,
}: {
  phone: string
  amount: number
  accountReference: string
  transactionDesc: string
  depositId: string
}): Promise<STKPushResponse> {
  const token = await getAccessToken()
  const timestamp = getTimestamp()
  const password = generatePassword(timestamp)
  const formattedPhone = formatMpesaPhone(phone)
  const roundedAmount = Math.ceil(amount) // M-Pesa requires integer

  const payload = {
    BusinessShortCode: SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: roundedAmount,
    PartyA: formattedPhone,
    PartyB: SHORTCODE,
    PhoneNumber: formattedPhone,
    CallBackURL: `${CALLBACK_URL}?deposit_id=${depositId}`,
    AccountReference: accountReference.slice(0, 12), // max 12 chars
    TransactionDesc: transactionDesc.slice(0, 13), // max 13 chars
  }

  const response = await axios.post<STKPushResponse>(
    `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  )

  if (response.data.ResponseCode !== '0') {
    throw new Error(`M-Pesa STK Push failed: ${response.data.ResponseDescription}`)
  }

  return response.data
}

// Query STK Push status
export async function queryMpesaSTKStatus(checkoutRequestId: string): Promise<STKQueryResponse> {
  const token = await getAccessToken()
  const timestamp = getTimestamp()
  const password = generatePassword(timestamp)

  const response = await axios.post<STKQueryResponse>(
    `${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  )

  return response.data
}

// Parse M-Pesa callback body
export function parseMpesaCallback(body: MpesaCallbackBody): {
  success: boolean
  checkoutRequestId: string
  merchantRequestId: string
  resultCode: number
  resultDesc: string
  amount?: number
  mpesaReceiptNumber?: string
  transactionDate?: string
  phoneNumber?: string
} {
  const stkCallback = body.Body.stkCallback

  if (stkCallback.ResultCode !== 0) {
    return {
      success: false,
      checkoutRequestId: stkCallback.CheckoutRequestID,
      merchantRequestId: stkCallback.MerchantRequestID,
      resultCode: stkCallback.ResultCode,
      resultDesc: stkCallback.ResultDesc,
    }
  }

  const metadata = stkCallback.CallbackMetadata?.Item || []
  const getItem = (name: string) => metadata.find((i) => i.Name === name)?.Value

  return {
    success: true,
    checkoutRequestId: stkCallback.CheckoutRequestID,
    merchantRequestId: stkCallback.MerchantRequestID,
    resultCode: stkCallback.ResultCode,
    resultDesc: stkCallback.ResultDesc,
    amount: Number(getItem('Amount')),
    mpesaReceiptNumber: String(getItem('MpesaReceiptNumber')),
    transactionDate: String(getItem('TransactionDate')),
    phoneNumber: String(getItem('PhoneNumber')),
  }
}

// B2C - Send money to user (for withdrawals)
export async function initiateMpesaB2C({
  phone,
  amount,
  remarks,
  occasion,
}: {
  phone: string
  amount: number
  remarks: string
  occasion: string
}): Promise<{ ConversationID: string; OriginatorConversationID: string; ResponseDescription: string }> {
  const token = await getAccessToken()
  const formattedPhone = formatMpesaPhone(phone)

  const response = await axios.post(
    `${MPESA_BASE_URL}/mpesa/b2c/v3/paymentrequest`,
    {
      InitiatorName: process.env.MPESA_INITIATOR_NAME || 'testapi',
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL || '',
      CommandID: 'BusinessPayment',
      Amount: Math.floor(amount),
      PartyA: SHORTCODE,
      PartyB: formattedPhone,
      Remarks: remarks.slice(0, 100),
      QueueTimeOutURL: `${CALLBACK_URL}/timeout`,
      ResultURL: `${CALLBACK_URL}/b2c-result`,
      Occasion: occasion.slice(0, 100),
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  )

  return response.data
}

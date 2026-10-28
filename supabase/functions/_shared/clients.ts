import Stripe from 'npm:stripe@23'

export { admin, cors, json } from './supabase.ts'

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2026-09-30.endive' })

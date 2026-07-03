# main.tf — provider configuration (Module 16.4).
# Backend + provider versions are pinned in backend.tf. All resources are split
# by concern: cloudflare.tf (edge) and fly.tf (host).

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "fly" {
  fly_api_token = var.fly_api_token
}

# Handy computed FQDNs used across resources.
locals {
  app_fqdn     = "${var.app_hostname}.${var.domain}"
  staging_fqdn = "${var.staging_hostname}.${var.domain}"
}

output "app_fqdn" {
  description = "Production app FQDN."
  value       = local.app_fqdn
}

output "staging_fqdn" {
  description = "Staging app FQDN."
  value       = local.staging_fqdn
}

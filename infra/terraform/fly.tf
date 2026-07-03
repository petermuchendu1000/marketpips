# fly.tf — Fly.io host-level infra (Module 16.4).
# App *deploys* are driven by flyctl in the CD workflows (image by digest);
# Terraform owns the durable host primitives: the certs for the custom domains
# so Fly serves valid TLS behind Cloudflare (full-strict). App creation/scaling
# beyond fly.toml can be added here as the fly provider matures.

resource "fly_cert" "app" {
  app      = var.fly_prod_app
  hostname = local.app_fqdn
}

resource "fly_cert" "staging" {
  app      = var.fly_staging_app
  hostname = local.staging_fqdn
}

output "fly_app_cert_hostname" {
  description = "Prod custom-domain cert hostname managed by Terraform."
  value       = fly_cert.app.hostname
}

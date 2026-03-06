# Tadpole Kubernetes Manifests

Deploy API and workers to Kubernetes. MongoDB and Redis must be available (managed service or separate deployments).

1. Build and push the API image: `docker build -t your-registry/tadpole-api:latest ./backend && docker push your-registry/tadpole-api:latest`
2. Update `api-deployment.yaml` and worker deployments to use your image name.
3. Create ConfigMap: `kubectl apply -f configmap.example.yaml` (or copy to `configmap.yaml` and edit).
4. Create Secret for JWT and other secrets: `kubectl create secret generic tadpole-secrets --from-literal=JWT_ACCESS_SECRET=... --from-literal=JWT_REFRESH_SECRET=...`
5. Apply deployments: `kubectl apply -f api-deployment.yaml -f worker-withdrawal-deployment.yaml -f worker-settlement-deployment.yaml`
6. Expose API via Ingress or LoadBalancer as needed.

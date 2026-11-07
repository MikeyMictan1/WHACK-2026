import { FeaturePage } from '../components/feature/FeaturePage.tsx'

export function Feature1Page() {
  return (
    <FeaturePage
      index="01"
      title="Feature 1"
      endpoint="/feature-1"
      description="A placeholder for your first feature. Build its components in this folder and its API in feature1_controller.py."
    />
  )
}

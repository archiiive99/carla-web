# iter-06-revisit-csm plan — pseudo-cascade frustum adaption

True multi-cascade CSM is out of Three.js directionalLight scope. As
a pseudo-cascade: the ortho shadow frustum adapts to camera height.
  - Street-level (camY < 10): ±100m tight frustum (high texel density)
  - Birdseye (camY > 80): ±350m wide frustum (coverage)
  - Linear ramp in between

Texel density at close camera automatically improves.

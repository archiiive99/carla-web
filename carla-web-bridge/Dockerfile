FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for turbojpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends libturbojpeg0 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# NOTE: the `carla` Python package is produced by the C++ build under
# <repo>/PythonAPI/dist/carla-*.whl and is NOT on PyPI. A working image
# needs to ADD that wheel here and `pip install` it — left as a follow-up
# (the out-of-container bridge covers our current workflow).

COPY src/ src/

EXPOSE 58337

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "58337"]

FROM python:3.13-slim
WORKDIR /sandbox
COPY sandbox.py /sandbox/runner.py
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SYNAPTIQ_SANDBOX=1
USER 65532:65532
ENTRYPOINT ["python", "-I", "/sandbox/runner.py"]

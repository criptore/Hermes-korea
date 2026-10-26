"""Surveillance du parent (app desktop) : arrêt du backend quand il disparaît."""

from __future__ import annotations

import os

import pytest

from hermes import surveillance_parent


def test_arret_des_que_le_parent_disparait():
    etats = iter([True, True, False])
    attentes: list[float] = []
    arrets: list[bool] = []

    surveillance_parent.surveiller(
        lambda: next(etats),
        lambda: arrets.append(True),
        intervalle=0.5,
        attendre=attentes.append,
    )

    assert arrets == [True]
    assert attentes == [0.5, 0.5]


def test_inactif_sans_pid_parent(monkeypatch):
    monkeypatch.delenv("HERMES_PARENT_PID", raising=False)
    assert surveillance_parent.demarrer() is None


@pytest.mark.parametrize("valeur", ["", "abc", "0", "1"])
def test_pid_invalide_ignore(monkeypatch, valeur):
    monkeypatch.setenv("HERMES_PARENT_PID", valeur)
    assert surveillance_parent.demarrer() is None


@pytest.mark.skipif(os.name == "nt", reason="Windows : Job Object côté Tauri")
def test_parent_direct_compare_getppid():
    vivant = surveillance_parent.parent_vivant_fn(os.getppid())
    assert vivant() is True


@pytest.mark.skipif(os.name == "nt", reason="Windows : Job Object côté Tauri")
def test_parent_indirect_sonde_le_pid():
    assert surveillance_parent.parent_vivant_fn(os.getpid())() is True
    assert surveillance_parent._pid_vivant(2**22 + 12345) is False

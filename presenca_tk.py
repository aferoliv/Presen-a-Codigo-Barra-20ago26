from pathlib import Path
'''
import keyboard
from pynput import keyboard
from pynput.keyboard import Key, Controller
import pandas as pd
'''
import tkinter as tk
import sys
from tkinter import ttk
from tkinter import *
from tkinter.messagebox import showinfo
from tkinter import filedialog
import os
import time

#
# Função para salvar o arquivo
def salvar_arquivo():
    global df
    file_path = filedialog.asksaveasfilename(defaultextension='.xlsx')
    df.to_excel(file_path, index=False)
    showinfo("Salvar", "Arquivo salvo com sucesso!")    
#
class Application(tk.Frame):
    def __init__(self, master=None):
        super().__init__(master)
        self.master = master
        self.pack()
        self.create_widgets()
        #self.create_table()
        self.widget1 = Frame(master)
        self.widget1.pack()
        self.msg = Label(self.widget1, text="Primeiro widget")
        self.msg.pack ()
        #
        self.primeiroContainer = Frame(master)
        self.primeiroContainer["pady"] = 10
        self.primeiroContainer.pack()
        self.titulo = Label(self.primeiroContainer, text="Matrícula")
        self.titulo["font"] = ("Arial", "10", "bold")
        #
        self.nome = Entry(self.primeiroContainer)
        self.nome["width"] = 30
        #self.nome["font"] = self.fontePadrao
        self.nome.pack(side=LEFT)
        self.titulo.pack()
        #
        self.sair = Button(self.widget1)
        self.sair["text"] = "Sair"
        self.sair["font"] = ("Calibri", "10")
        self.sair["width"] = 5
        self.sair["command"] = self.widget1.quit
        self.sair.pack ()
        #
    def create_widgets(self):
        self.quit = tk.Button(self, text="Sair", fg="red",
                              command=self.master.destroy)
        self
    
##************************
root=tk.Tk()
root.title("Presença QUI112")
root.geometry("800x600")
app = Application(master=root)
print(app.nome)
app.mainloop()

